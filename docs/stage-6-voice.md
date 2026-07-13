# Stage 6 voice receptionist

## Delivered

- NestJS Socket.IO gateway at `/receptionist` accepts realtime conversation turns and emits status/reply events.
- Browser microphone support through the Web Speech API with progressive partial transcript display.
- Only finalized recognition results are sent to the AI; interim speech is never treated as a completed visitor turn.
- Push-to-talk control: the visitor holds the button while speaking and releases it to end the turn.
- Browser text-to-speech reads assistant replies aloud.
- Barge-in support: starting a new microphone turn immediately cancels active speech output.
- Visible transcript, a stop-speaking control, unsupported-browser message, and typed chat fallback remain available.

## Verification

- Typecheck, lint, unit/contract tests, and production build pass with the WebSocket gateway and browser client included.
- Manual microphone quality assurance remains browser/device dependent and should be performed in Chromium on desktop and mobile before production release.
