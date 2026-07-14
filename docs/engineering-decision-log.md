# Engineering decision log

Current baseline: 16 July 2026. This records the decisions made while turning the prototype into a reliable voice receptionist and appointment workflow.

## 1. Keep the active platform small and explicit

**Decision:** The active application is the TypeScript workspace: React/Vite in `apps/web`, NestJS in `apps/api`, Prisma/PostgreSQL, and shared contracts/prompts in `packages/`.

**Why:** The repository also contains retired `client/` and `server/` sources. Continuing to modify both would create incompatible behaviour and misleading test results.

**Consequence:** New work, builds, migrations, and deployment checks target `apps/*` and `packages/*` only.

## 2. Use server-side Google Cloud TTS with a browser fallback

**Decision:** Cloud Text-to-Speech is called only by the API. Browser speech synthesis remains the automatic fallback.

**Why:** This protects Google credentials, avoids exposing an API key in the browser, and keeps the receptionist usable if Cloud TTS, billing, or credentials are unavailable.

**Implementation safeguards:**

- Application Default Credentials are used locally; no service-account JSON key is stored in the repository.
- The API only synthesizes the latest assistant reply for an existing session, never arbitrary browser text.
- Replies are capped at 350 characters, rate-limited, and counted against a monthly character budget.
- The configured default is a warm English Google Neural2 female voice; browser speech is used on failure.

## 3. Use Chirp 3 as an accuracy upgrade, not a single point of failure

**Decision:** The browser Web Speech API provides the immediate transcript, while recorded turn audio is sent to Google Cloud Speech-to-Text Chirp 3 when available. The browser transcript is the fallback.

**Why:** Browsers remain fast and free; Chirp improves understanding of accents, phone numbers, email addresses, and less-clear speech. The application still works when Cloud STT is unavailable.

**Cost controls:**

- A turn is limited to 45 seconds.
- Audio size is bounded.
- Transcription use is persisted and limited by a monthly seconds budget.
- The transcription endpoint is rate-limited.

## 4. Do not trust the model to run a transaction

**Decision:** Gemini is used for natural language and business answers. Application code owns appointment state, availability, draft creation, confirmation, and mutations.

**Why:** The model can be conversationally useful but is not a reliable transaction state machine. It can omit fields, repeat questions, or claim success without an actual mutation.

**Consequence:** Creating, updating, and cancelling an appointment all follow a prepare-then-confirm workflow. A booking is never created merely because the model said it was.

## 5. Preserve contact details deterministically

**Decision:** Name, email, and phone extraction is persisted in the conversation session independently of the model response.

**Why:** Phone numbers and spoken emails are unusually error-prone, and a model reply should not be the only record of a detail already given.

**Implementation details:**

- Spoken `at`, `dot`, and `point` are normalized for emails.
- Number words such as `zero`, `oh`, and `seven` are normalized for phone numbers.
- A plain name is accepted when the receptionist just asked for a name.
- Once a value is stored, the prompt and workflow must not ask for it again.

## 6. A voice call must use one session for its entire lifetime

**Decision:** The Call page keeps the current session ID in a React ref, and the voice hook stores the latest turn callback in a ref.

**Why:** React closures previously allowed microphone callbacks to retain an old `sessionId` (often `undefined`). Each spoken turn could then create a new backend conversation. The visible symptom was the receptionist repeatedly asking for the caller's name.

**Consequence:** All turns in an active call now use the same session, and the call cannot silently continue if that session is unavailable.

## 7. The Call page owns a visible booking state machine

**Decision:** Booking inside a call advances through explicit stages:

`collecting details -> choose live time -> confirmation -> completed`

**Why:** A hidden form below a voice conversation is not a voice booking experience. Earlier versions also incorrectly told callers to open Chat to review a Call-page booking.

**Current behaviour:**

- The receptionist collects name, phone, and email.
- It loads live availability and says the first three options.
- The caller can say `first`, `second`, or `third`, or tap the displayed option.
- The application prepares a draft and asks for a clear `yes`; the caller can also press **Confirm booking**.
- Only after confirmation does it create the booking and announce the confirmed appointment time.

## 8. Keep a final confirmation for any booking mutation

**Decision:** Appointment creation, rescheduling, and cancellation always require explicit confirmation.

**Why:** Speech recognition can mishear a date, time, email address, or a casual sentence. A safe receptionist must avoid silent calendar changes.

**Consequence:** A draft expires after ten minutes and is tied to the active conversation session. Confirmation is idempotent, so a repeated click or request cannot create duplicate bookings.

## 9. Existing bookings require a secure manage token

**Decision:** Updating or cancelling an existing booking requires the token from the confirmation link, not only a spoken name or phone number.

**Why:** Names and phone numbers are not sufficient proof that a caller may change an appointment.

**Current behaviour:** The Call page can securely open the booking using that token, load live reschedule times, prepare a change or cancellation, and require confirmation.

## 10. Test the real user path, not only the API

**Decision:** API tests remain necessary but are not considered sufficient for voice bookings.

**Why:** The session-loss defect passed direct API testing because the test manually supplied the correct session ID. It failed in the actual browser call flow.

**Required release checks:**

- Typecheck and lint pass.
- Web and API readiness endpoints respond.
- A browser-level test covers: start call, preserve one session, provide name/email/phone, select an offered slot, confirm, and see a confirmed booking.
- Manual Chromium microphone/speaker testing remains necessary because browser permissions and audio hardware are device-specific.

## 11. Rotate four stable receptionist personas per call

**Decision:** Each newly started voice call randomly selects one receptionist—Maya, John, Sofia, or Leo—and stores that choice in the conversation session.

**Why:** The core receptionist and booking logic is shared, while a stable identity, voice, introduction, and catchphrase set make calls feel less scripted and more human.

**Implementation safeguards:**

- The selection is made once at call start; it cannot change during the call.
- The selected persona supplies the fast spoken introduction, for example: “Hi, I’m John. What can I sort out for you?”
- The AI prompt receives that persona’s personality and occasional catchphrases, but is instructed not to repeat them mechanically.
- Google TTS reads the persisted session persona and uses that persona’s Neural2 voice for every call reply.
- The Call page shows the caller who is on the line.

## 12. Let callers interrupt and resume transactional workflows

**Decision:** A booking is no longer an irreversible conversational mode. The workflow can be active, paused, or idle, while contact details remain available for the duration of the call.

**Why:** Callers naturally interrupt themselves: they ask a company question, request a person, correct an email, or decide to resume later. Treating every utterance as the next booking field makes the receptionist feel rigid and causes incorrect prompts.

**Implementation safeguards:**

- General questions and transfer requests pause an active booking instead of being forced into data collection.
- `continue booking` explicitly resumes it.
- Contact-correction language updates only the relevant fact and re-offers live times.
- Booking failures are turned into spoken recovery steps; unavailable slots reload alternatives, expired drafts refresh, and paused bookings remain paused.
- A paused state is authoritative: the model cannot force the caller back into booking mode.

## Problems encountered and how they were solved

| Problem observed | Root cause | Resolution | Preventive lesson |
| --- | --- | --- | --- |
| Microphone initially appeared not to work. | Browser/device microphone permission and recognition support had not been verified. | Added microphone preparation before the call, clear recognition errors, visible transcript feedback, and browser fallback guidance. | Always test microphone permissions and the exact browser before debugging AI logic. |
| The assistant did not speak, or used the old browser voice. | Cloud TTS startup/authentication and Vite's cached development transform made it look as though a newer voice configuration had not applied. | Configured Google Cloud credentials through ADC, kept browser speech fallback, and started Vite with a forced dependency refresh in Docker. | Separate voice-provider failure from stale frontend assets; verify the actually served client build. |
| Google service-account JSON key creation was blocked. | The Google organisation policy disabled service-account key creation. | Used Application Default Credentials locally instead of weakening the organisation policy; documented workload identity/service attachment as the production path. | Never work around a security policy by putting long-lived keys in the repository or browser. |
| Calls could hear the visitor poorly, especially for phone numbers and email. | Browser recognition varies by accent, microphone, and spoken punctuation. | Added Chirp 3 turn transcription as an upgrade, phrase hints for business terms, spoken-email normalization, digit-word normalization, and browser recognition fallback. | Treat recognition as uncertain input and preserve a correction path for important fields. |
| The assistant sometimes replied with a generic, repetitive failure sentence. | A model error or invalid structured response fell into a single generic fallback. | Added context-aware recovery replies based on the known booking state. | Error recovery should continue the workflow when safe, not discard the caller's progress. |
| The assistant forgot the caller's name after they gave their phone and email. | Contact fields depended partly on model output, and plain names were not reliably extracted. | Persisted contact details deterministically, accepted a plain name after a name prompt, and merged known values into every booking response. | Critical business fields must be extracted and persisted by application code, not only by a model. |
| API-level booking tests passed, but the Call page still repeatedly asked for the name. | A stale React closure in the voice callback retained the pre-call `sessionId`, so later voice turns could be sent as entirely new conversations. | Stored both the active session ID and the latest voice callback in refs. All turns now use the one live call session. | End-to-end browser tests are required for stateful voice features; API tests alone can mask UI lifecycle defects. |
| Callers could not tell how to finish a booking. | The original Call page showed a generic form below the conversation and even directed callers to Chat for review. It did not offer times or interpret spoken choices. | Replaced the call booking path with explicit stages: collect details, offer live slots, select by voice or button, prepare, confirm, and announce success. | A voice workflow needs visible, spoken next steps and one clear completion state. |
| A booking could be prepared but not safely completed. | Model language was previously too close to the mutation step, creating a risk of saying an appointment was booked before the database action succeeded. | Introduced server-side prepare/confirm drafts, expiration, session binding, idempotent execution, and a success response only after the CRM mutation returns. | The model may explain an action; only the transactional backend may perform and confirm it. |
| Existing booking changes could be abused by someone who knew a name or phone number. | Name and phone are not reliable authorization factors. | Required the secure manage token from the confirmation link before update or cancellation, then required explicit confirmation of the requested action. | Keep identity/authorization separate from conversational convenience. |
| Voice and transcription usage could produce uncontrolled cloud costs. | TTS and STT are metered services, and an open public endpoint could be abused. | Added character/seconds budgets, per-turn limits, endpoint rate limits, payload limits, and a free browser fallback. | Cost controls must be designed into each cloud call before deployment, not added after a surprise bill. |

## Debugging checklist before changing the receptionist

1. Confirm the browser is serving the current frontend build and the API is healthy.
2. Read the visible `I heard:` transcript before assuming the model misunderstood the caller.
3. Verify the same `sessionId` is used throughout the call.
4. Check which booking stage is visible: collecting, choose-time, confirmation, or completed.
5. Confirm a live slot exists before investigating booking creation.
6. Check the API response and draft/confirmation result before claiming that an appointment was created.

## Current open work

- Add automated browser coverage for the complete Call-page booking flow.
- Improve spoken date/time matching beyond the first three offered options.
- Add explicit spoken read-back and correction for email and phone values before the final booking confirmation.
- Resolve or update older documentation that still describes the retired press-and-hold or Socket.IO-first voice flow; the current Call page uses click-to-call, turn-based recognition, Cloud TTS, and the HTTP receptionist API.
