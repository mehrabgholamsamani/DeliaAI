import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams
} from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  Headphones,
  ChevronUp,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MessageSquareText,
  Mic,
  PhoneCall,
  Send,
  Settings2,
  ShieldCheck
} from 'lucide-react';
import {
  cancelManagedBooking,
  cancelWorkspaceCrmBooking,
  chatPublicWidget,
  chatWithReceptionist,
  createHandoffRequest,
  confirmReceptionistBooking,
  createBooking,
  chatWithWorkspaceReceptionist,
  confirmWorkspaceReceptionistBooking,
  deleteWorkspaceKnowledge,
  deleteKnowledge,
  getAdminBookings,
  getAdminServices,
  getKnowledge,
  getKnowledgeInsights,
  getReceptionistSettings,
  getAvailability,
  getCurrentAccount,
  getGoogleLoginStatus,
  getManagedBooking,
  getWorkspace,
  getWorkspaceKnowledge,
  getWorkspaceCrmBookings,
  getWorkspaceCrmCustomers,
  getWorkspaceWidget,
  getWorkspaceWidgetSessions,
  getWorkspaceAvailability,
  getWorkspaceServices,
  login,
  logout,
  getServices,
  prepareReceptionistBooking,
  prepareWorkspaceReceptionistBooking,
  prepareReceptionistCancel,
  prepareReceptionistUpdate,
  confirmReceptionistAction,
  saveAdminService,
  saveKnowledge,
  saveOnboarding,
  saveWorkspaceSettings,
  saveReceptionistSettings,
  saveWorkspaceKnowledge,
  saveWorkspaceService,
  saveWorkspaceWidget,
  signUp,
  startGoogleLogin,
  startPublicWidget,
  startReceptionistCall,
  startWorkspaceReceptionistCall,
  type Booking,
  type CrmCustomer,
  type BookingDraft,
  type Account,
  type KnowledgeArticle,
  type ReceptionistSettings,
  type ReceptionistReply,
  type OnboardingBusiness,
  type Service,
  type WorkspaceSettings,
  type WidgetSettings,
  type WidgetTranscript,
  updateManagedBooking
  ,updateWorkspaceCrmBooking
} from './api';
import './styles.css';
import { useVoiceReceptionist } from './hooks/useVoiceReceptionist';

const today = new Date().toISOString().slice(0, 10);
const tonePresets = [
  {
    label: 'Warm and friendly',
    value:
      'Warm, kind, conversational, and reassuring. Use natural phrases such as “I’ve got you,” “No problem,” and “Of course,” without overdoing them.'
  },
  {
    label: 'Polished and professional',
    value:
      'Polished, calm, professional, and warmly helpful. Use clear, confident language without slang.'
  },
  {
    label: 'Bright and upbeat',
    value:
      'Bright, positive, and energetic while still concise and respectful. Use encouraging language and calm confidence.'
  },
  {
    label: 'Relaxed and casual',
    value:
      'Relaxed, friendly, and conversational. Use simple everyday language such as “I’ve got you” and “No problem,” but never be rude or overly familiar.'
  }
] as const;
const formatTime = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value)
  );

function findOfferedSlot(message: string, slots: { startAt: string; available: boolean }[]) {
  const text = message.toLowerCase();
  const ordinal = /\b(first|one|1st|1)\b/.test(text)
    ? 0
    : /\b(second|two|2nd|2)\b/.test(text)
      ? 1
      : /\b(third|three|3rd|3)\b/.test(text)
        ? 2
        : -1;
  if (ordinal >= 0) return slots[ordinal];
  return slots.find((slot) => {
    const date = new Date(slot.startAt);
    const weekday = new Intl.DateTimeFormat('en', { weekday: 'long' }).format(date).toLowerCase();
    const hour = new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: true })
      .format(date)
      .toLowerCase()
      .replace(/\s/g, '');
    return text.includes(weekday) && text.replace(/\s/g, '').includes(hour);
  });
}
function isAffirmative(message: string) {
  return /\b(?:yes|yeah|yep|confirm|correct|please do|go ahead|book it)\b/i.test(message);
}
function isNegative(message: string) {
  return /\b(?:no|nope|not that|another time|change it)\b/i.test(message);
}
function isContactCorrection(message: string) {
  return /\b(?:change|update|replace|use).*\b(?:name|email|e-?mail|phone|number)\b|\bmy (?:new )?(?:email|e-?mail|phone|number) (?:is|should be)\b/i.test(
    message
  );
}
function isBookingPauseRequest(message: string) {
  if (isContactCorrection(message)) return false;
  return /\b(?:actually|by the way|before that|instead|can you|could you|would you|who is|what is|where is|how much|talk|speak|transfer|give .*?(?:phone|number))\b/i.test(
    message
  );
}
function isBookingResumeRequest(message: string) {
  return /\b(?:continue|carry on|resume|back to (?:the )?booking)\b/i.test(message);
}
function bookingRecoveryMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : '';
  const normalized = message.toLowerCase();
  if (normalized.includes('no longer available'))
    return 'That time was just taken. I will check the next available options.';
  if (normalized.includes('temporarily paused'))
    return 'Bookings are temporarily paused. I can still take a callback request for the team.';
  if (normalized.includes('expired') || normalized.includes('invalid'))
    return 'That confirmation expired, so I will refresh the available times for you.';
  if (normalized.includes('email'))
    return 'There is an issue with that email address. Please say the address again, including at and dot.';
  return 'Something changed while I was saving that. I will help you recover the booking.';
}

function trackUxEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined') return;
  const event = { name, properties, at: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('delia:ux-event', { detail: event }));
  const key = 'delia:ux-events';
  const history = JSON.parse(window.sessionStorage.getItem(key) || '[]') as typeof event[];
  window.sessionStorage.setItem(key, JSON.stringify([...history.slice(-49), event]));
}

function playRingtone() {
  const context = new AudioContext();
  void context.resume();
  const ring = (at: number) => {
    const oscillator = context.createOscillator();
    const oscillatorTwo = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 440;
    oscillatorTwo.frequency.value = 480;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.11, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.38);
    oscillator.connect(gain).connect(context.destination);
    oscillatorTwo.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillatorTwo.start(at);
    oscillator.stop(at + 0.4);
    oscillatorTwo.stop(at + 0.4);
  };
  const start = context.currentTime + 0.05;
  [0, 0.48, 1.9, 2.38].forEach((offset) => ring(start + offset));
  return new Promise<void>((resolve) =>
    window.setTimeout(() => {
      void context.close();
      resolve();
    }, 3100)
  );
}

function playTypingSound() {
  const context = new AudioContext();
  void context.resume();
  const start = context.currentTime + 0.02;
  for (let index = 0; index < 10; index += 1) {
    const click = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * (0.045 + Math.random() * 0.018);
    click.type = 'square';
    click.frequency.value = 850 + Math.random() * 500;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.045, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.026);
    click.connect(gain).connect(context.destination);
    click.start(at);
    click.stop(at + 0.03);
  }
  return new Promise<void>((resolve) =>
    window.setTimeout(() => {
      void context.close();
      resolve();
    }, 520)
  );
}

function playHangUpSound() {
  const context = new AudioContext();
  void context.resume();
  const tone = context.createOscillator();
  const gain = context.createGain();
  const start = context.currentTime;
  tone.type = 'sine';
  tone.frequency.setValueAtTime(620, start);
  tone.frequency.exponentialRampToValueAtTime(240, start + 0.22);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.13, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
  tone.connect(gain).connect(context.destination);
  tone.start(start);
  tone.stop(start + 0.26);
  window.setTimeout(() => void context.close(), 320);
}

function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isWorkspaceRoute = location.pathname.startsWith('/dashboard');
  return (
    <>
      {!isWorkspaceRoute && <header>
        <Link className="brand" to="/">
          <img src="/delia-logo.svg" alt="DeliaAI" />
        </Link>
        <nav>
          <NavLink to="/receptionist">See a demo</NavLink>
          <NavLink to="/login">Sign in</NavLink>
          <Link className="button header-cta" to="/signup">
            Start free
          </Link>
        </nav>
      </header>}
      {children}
      {!isWorkspaceRoute && (
        <footer>
          <span>Delia</span>
          <span>Clear answers. Confirmed appointments.</span>
        </footer>
      )}
    </>
  );
}

function Home() {
  return (
    <main className="home-page">
      <section className="hero hero-split">
        <div className="hero-copy">
          <p className="eyebrow">A dependable front desk, without the hold music</p>
          <h1>Every call answered. Every detail captured.</h1>
          <p>
            Delia answers the questions your team gets every day, books against real availability,
            and hands over the conversations that need a human.
          </p>
          <div className="actions">
            <Link className="button" to="/signup">
              Build your receptionist <ArrowRight size={16} />
            </Link>
            <Link className="button secondary" to="/receptionist">
              Try the live demo
            </Link>
          </div>
          <p className="hero-note">No credit card · Set up with your own services and policies</p>
        </div>
        <div className="product-glimpse" aria-label="Receptionist product preview">
          <div className="glimpse-topbar">
            <span>Delia</span>
            <span className="live-dot">Live</span>
          </div>
          <div className="glimpse-call">
            <div className="glimpse-avatar">M</div>
            <div>
              <strong>Maya is on the line</strong>
              <span>AI receptionist · Connected</span>
            </div>
          </div>
          <div className="glimpse-message assistant">Good morning, Northstar Dental. How can I help?</div>
          <div className="glimpse-message caller">Do you have a cleaning after 4pm?</div>
          <div className="glimpse-message assistant">Yes — Tuesday at 4:30 or Thursday at 5:00.</div>
          <div className="glimpse-footer">
            <span>Listening…</span>
            <span className="sound-bars">▮▮▮▮</span>
          </div>
        </div>
      </section>
      <section className="trust-strip" aria-label="Product safeguards">
        <span><ShieldCheck /> Answers from your approved information</span>
        <span><CheckCircle2 /> Confirms before changing a booking</span>
        <span><PhoneCall /> Hands off with the context attached</span>
      </section>
      <section className="home-section-heading">
        <p className="eyebrow">Built for the work behind the call</p>
        <h2>Useful from the first hello to the final confirmation.</h2>
      </section>
      <section className="feature-grid numbered-features">
        <article>
          <span>01</span><Mic />
          <h3>Answers like your front desk</h3>
          <p>
            Your services, policies, hours, and preferred tone shape every response.
          </p>
        </article>
        <article>
          <span>02</span><CalendarDays />
          <h3>Books with real availability</h3>
          <p>
            Delia offers open times, collects contact details, and asks before committing anything.
          </p>
        </article>
        <article>
          <span>03</span><MessageSquareText />
          <h3>Keeps your team in the loop</h3>
          <p>
            Bookings, customer records, transcripts, and handoffs land in one private workspace.
          </p>
        </article>
      </section>
      <section className="home-workflow">
        <div>
          <p className="eyebrow">A controlled rollout</p>
          <h2>Teach it. Test it. Then put it in front of customers.</h2>
          <p>Nothing goes live by accident. Build the knowledge base, make private test calls, and publish when the answers sound right.</p>
          <Link className="text-link" to="/signup">Start with your business details <ArrowRight size={15} /></Link>
        </div>
        <ol>
          <li><span>1</span><div><strong>Add the essentials</strong><small>Services, hours, policies, and handoff rules.</small></div></li>
          <li><span>2</span><div><strong>Call your receptionist</strong><small>Test difficult questions before customers do.</small></div></li>
          <li><span>3</span><div><strong>Publish with confidence</strong><small>Add Delia to your website when you are ready.</small></div></li>
        </ol>
      </section>
    </main>
  );
}

function RequireAccount({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void getCurrentAccount()
      .then(setAccount)
      .catch(() => setAccount(undefined))
      .finally(() => setReady(true));
  }, []);
  if (!ready)
    return (
      <main className="page">
        <p className="interim">Loading your workspace…</p>
      </main>
    );
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AuthPage({ mode }: { mode: 'signup' | 'login' }) {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    void getGoogleLoginStatus()
      .then((result) => setGoogleEnabled(result.enabled))
      .catch(() => setGoogleEnabled(false));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const account =
        mode === 'signup'
          ? await signUp({ email, password, businessName })
          : await login({ email, password });
      nav(account.onboardingCompleted ? '/dashboard' : '/onboarding');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'We could not sign you in. Please try again.'
      );
    } finally {
      setSaving(false);
    }
  }
  const signingUp = mode === 'signup';
  return (
    <main className="page auth-page">
      <aside className="auth-intro">
        <Link className="auth-back" to="/">← Back to Delia</Link>
        <p className="eyebrow">Your private workspace</p>
        <h1>{signingUp ? 'A calmer way to run the front desk.' : 'Pick up where you left off.'}</h1>
        <p>{signingUp ? 'Add the facts your receptionist needs, test the experience privately, and publish only when it sounds like your business.' : 'Your services, conversations, bookings, and receptionist settings are waiting for you.'}</p>
        <div className="auth-points">
          <span><CheckCircle2 /> Guided setup, no prompt writing</span>
          <span><ShieldCheck /> Workspace-scoped customer data</span>
          <span><PhoneCall /> Test calls before publishing</span>
        </div>
      </aside>
      <section className="summary auth-card">
        <p className="eyebrow">{signingUp ? 'Create your account' : 'Welcome back'}</p>
        <h2>{signingUp ? 'Start building Delia' : 'Sign in to Delia'}</h2>
        <p>
          {signingUp
            ? 'No credit card required. You can test everything before it reaches a customer.'
            : 'Continue setting up and testing your receptionist.'}
        </p>
        <form className="form" onSubmit={(event) => void submit(event)}>
          {signingUp && (
            <label>
              Business name
              <input
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                minLength={2}
                maxLength={120}
                required
                autoComplete="organization"
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={signingUp ? 12 : 1}
              maxLength={128}
              required
              autoComplete={signingUp ? 'new-password' : 'current-password'}
            />
          </label>
          {signingUp && (
            <small>Use at least 12 characters. We store only a secure password hash.</small>
          )}
          {error && <p className="error">{error}</p>}
          <button className="button" disabled={saving}>
            {saving ? 'Please wait…' : signingUp ? 'Create free workspace' : 'Sign in'}
          </button>
        </form>
        <div className="auth-divider"><span>or</span></div>
        <button className="button google-auth" onClick={startGoogleLogin} disabled={saving || !googleEnabled}>
          <span aria-hidden="true">G</span> Continue with Google
        </button>
        <small className="auth-note">
          {googleEnabled
            ? 'Google sign-in is just the account step. We’ll ask for your business details next.'
            : 'Google sign-in will unlock when the server-only Google client secret is added.'}
        </small>
        <p>
          {signingUp ? 'Already have an account? ' : 'New here? '}
          <Link className="text-link" to={signingUp ? '/login' : '/signup'}>
            {signingUp ? 'Sign in' : 'Create your free workspace'}
          </Link>
        </p>
      </section>
    </main>
  );
}

const onboardingDefaults: OnboardingBusiness = {
  businessName: '',
  industry: '',
  companyDescription: '',
  contactDetails: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin',
  greeting: 'Hello, thanks for calling. How can I help you today?',
  bookingInstructions: 'Offer live availability and always ask for confirmation before booking.',
  handoffInstructions: 'Offer a callback when the answer is not in approved business information.'
};

const industryOptions = ['Salon & beauty', 'Health & wellness', 'Dental clinic', 'Home services', 'Legal & professional', 'Fitness & coaching', 'Automotive', 'Other'];
const descriptionStarters = [
  'We help local customers with trusted, appointment-based service.',
  'We provide friendly, professional care with clear pricing and flexible booking.',
  'We specialise in fast, reliable help for customers who need an expert.'
];

function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<OnboardingBusiness>(onboardingDefaults);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void getWorkspace()
      .then((value) => {
        setValues({ ...onboardingDefaults, ...value.business });
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setReady(true));
  }, []);
  const update = (key: keyof OnboardingBusiness, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const applyIndustry = (industry: string) =>
    setValues((current) => ({
      ...current,
      industry,
      companyDescription:
        current.companyDescription === onboardingDefaults.companyDescription
          ? `We provide friendly, reliable ${industry.toLowerCase()} appointments with clear next steps for every customer.`
          : current.companyDescription,
      greeting:
        current.greeting === onboardingDefaults.greeting
          ? `Hello, thanks for calling ${current.businessName || 'our business'}. How can I help today?`
          : current.greeting
    }));
  const valid =
    step === 0
      ? values.businessName.trim().length >= 2 && values.industry.trim().length >= 2
      : step === 1
        ? values.companyDescription.trim().length >= 20
        : step === 2
          ? values.contactDetails.trim().length >= 5 && values.timezone.trim().length >= 2
          : values.greeting.trim().length >= 2 &&
            values.bookingInstructions.trim().length >= 2 &&
            values.handoffInstructions.trim().length >= 2;
  async function finish() {
    setSaving(true);
    setError('');
    try {
      await saveOnboarding(values);
      nav('/dashboard');
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'We could not save your business information.'
      );
    } finally {
      setSaving(false);
    }
  }
  if (!ready)
    return (
      <main className="page">
        <p className="interim">Preparing your guided setup…</p>
      </main>
    );
  const titles = [
    'Your business',
    'What customers should know',
    'Where to reach you',
    'How your receptionist should help'
  ];
  return (
    <main className="page onboarding-page">
      <section className="summary onboarding-card">
        <p className="eyebrow">Guided setup · Step {step + 1} of 4</p>
        <h1>{titles[step]}</h1>
        <p>Give clear facts, not a prompt. We will turn these into safe receptionist context.</p>
        <div className="progress">
          <span style={{ width: `${(step + 1) * 25}%` }} />
        </div>
        {step === 0 && (
          <div className="form">
            <label>
              Business name
              <input
                value={values.businessName}
                onChange={(event) => update('businessName', event.target.value)}
              />
            </label>
            <label>
              Industry or business type
              <input
                value={values.industry}
                placeholder="e.g. dental clinic, salon, legal practice"
                onChange={(event) => update('industry', event.target.value)}
              />
            </label>
            <div className="choice-group" aria-label="Business type suggestions">
              {industryOptions.map((industry) => <button type="button" key={industry} className={values.industry === industry ? 'selected' : ''} onClick={() => applyIndustry(industry)}>{industry}</button>)}
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="form">
            <label>
              What do you do?
              <textarea
                value={values.companyDescription}
                placeholder="Explain your services, ideal customers, and what makes you different."
                onChange={(event) => update('companyDescription', event.target.value)}
              />
            </label>
            <small>
              Example: “We provide same-week bicycle repairs and servicing for commuters in central
              Berlin.”
            </small>
            <div className="choice-group" aria-label="Description starters">
              {descriptionStarters.map((starter) => <button type="button" key={starter} onClick={() => update('companyDescription', starter)}>{starter}</button>)}
            </div>
          </div>
        )}
        {step === 2 && (
          <div className="form">
            <label>
              Contact details
              <textarea
                value={values.contactDetails}
                placeholder="Phone, email, address, parking/access instructions, or anything callers should know."
                onChange={(event) => update('contactDetails', event.target.value)}
              />
            </label>
            <label>
              Business timezone
              <input
                value={values.timezone}
                onChange={(event) => update('timezone', event.target.value)}
              />
            </label>
          </div>
        )}
        {step === 3 && (
          <div className="form">
            <label>
              Opening greeting
              <input
                value={values.greeting}
                onChange={(event) => update('greeting', event.target.value)}
              />
            </label>
            <label>
              Booking guidance
              <textarea
                value={values.bookingInstructions}
                onChange={(event) => update('bookingInstructions', event.target.value)}
              />
            </label>
            <label>
              When should it hand off to a human?
              <textarea
                value={values.handoffInstructions}
                onChange={(event) => update('handoffInstructions', event.target.value)}
              />
            </label>
          </div>
        )}
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0 || saving}
          >
            Back
          </button>
          {step < 3 ? (
            <button
              className="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={!valid}
            >
              Continue
            </button>
          ) : (
            <button className="button" onClick={() => void finish()} disabled={!valid || saving}>
              {saving ? 'Saving securely…' : 'Finish setup'}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

export function Dashboard() {
  const nav = useNavigate();
  const [account, setAccount] = useState<Account>();
  useEffect(() => {
    void getCurrentAccount()
      .then(setAccount)
      .catch(() => undefined);
  }, []);
  async function signOut() {
    await logout();
    nav('/');
  }
  return (
    <main className="page dashboard-page">
      <p className="eyebrow">Your workspace</p>
      <h1>{account?.workspaceName || 'Your business'} is ready to grow.</h1>
      <p>
        Stage 1 is complete: your account and business information are isolated and securely stored.
      </p>
      <div className="feature-grid">
        <article>
          <h2>Business information</h2>
          <p>Your guided setup is the source of truth for the receptionist.</p>
          <Link className="text-link" to="/onboarding">
            Review setup →
          </Link>
        </article>
        <article>
          <h2>Chat test lab</h2>
          <p>Coming in Stage 2: test answers before a customer hears them.</p>
        </article>
        <article>
          <h2>Live receptionist</h2>
          <p>Coming in Stage 3: connect your private business context to voice calls.</p>
        </article>
      </div>
      <button className="button secondary" onClick={() => void signOut()}>
        Sign out
      </button>
    </main>
  );
}

function WorkspaceShell({
  title,
  eyebrow,
  children
}: {
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  const [account, setAccount] = useState<Account>();
  const [menuOpen, setMenuOpen] = useState(() => {
    if (typeof window === 'undefined') return true;
    const saved = window.sessionStorage.getItem('delia:sidebar-open');
    return saved === null ? window.matchMedia('(min-width: 960px)').matches : saved === 'true';
  });
  useEffect(() => {
    window.sessionStorage.setItem('delia:sidebar-open', String(menuOpen));
  }, [menuOpen]);
  useEffect(() => {
    void getCurrentAccount()
      .then(setAccount)
      .catch(() => undefined);
  }, []);
  return (
    <main className={menuOpen ? 'workspace-page sidebar-open' : 'workspace-page'}>
      {menuOpen && (
        <button
          className="workspace-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className="workspace-sidebar">
        <div className="workspace-sidebar-head">
          <Link className="workspace-brand" to="/dashboard">
            <span className="workspace-brand-name">
              {account?.workspaceName || 'Your workspace'}
            </span>
          </Link>
          <button
            className="workspace-menu"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls="workspace-navigation"
            aria-label={menuOpen ? 'Collapse navigation' : 'Expand navigation'}
          >
            <Menu size={19} />
          </button>
        </div>
        <nav className="workspace-nav" id="workspace-navigation">
          <NavLink to="/dashboard" end title="Overview">
            <LayoutDashboard /> <span>Overview</span>
          </NavLink>
          <NavLink to="/dashboard/inbox" title="Inbox">
            <MessageSquareText /> <span>Inbox</span>
          </NavLink>
          <NavLink to="/dashboard/receptionist" title="Receptionist">
            <Headphones /> <span>Receptionist</span>
          </NavLink>
          <NavLink to="/dashboard/crm" title="Bookings">
            <CalendarDays /> <span>Bookings</span>
          </NavLink>
          <NavLink to="/dashboard/widget" title="Website">
            <Building2 /> <span>Website</span>
          </NavLink>
        </nav>
        <div className="workspace-bottom">
          <NavLink className="workspace-settings" to="/dashboard/settings" title="Settings">
            <Settings2 /> <span>Settings</span>
          </NavLink>
          <div className="workspace-profile">
            <span className="workspace-email">{account?.email}</span>
            <button onClick={() => void logout().then(() => nav('/'))}>Sign out</button>
          </div>
        </div>
      </aside>
      <section className="workspace-content">
        <button
          className="workspace-mobile-menu"
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation"
        >
          <Menu size={19} /> <span>Menu</span>
        </button>
        {(eyebrow || title) && (
          <header className="workspace-page-heading">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h1>{title}</h1>}
          </header>
        )}
        {children}
      </section>
    </main>
  );
}

function WorkspaceDashboard() {
  const [knowledgeCount, setKnowledgeCount] = useState<number>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [widgetLive, setWidgetLive] = useState<boolean>();
  const [serviceCount, setServiceCount] = useState<number>();
  useEffect(() => {
    void Promise.all([getWorkspaceKnowledge(), getWorkspaceCrmBookings(), getWorkspaceCrmCustomers(), getWorkspaceWidget(), getWorkspaceServices()])
      .then(([articles, nextBookings, nextCustomers, widget, services]) => {
        setKnowledgeCount(articles.length);
        setBookings(nextBookings);
        setCustomers(nextCustomers);
        setWidgetLive(widget.isEnabled);
        setServiceCount(services.filter((service) => service.isActive).length);
      })
      .catch(() => setKnowledgeCount(0));
  }, []);
  const openBookings = bookings.filter((booking) => booking.status === 'OPEN');
  const setupSteps = [
    { label: 'Add bookable services', done: Boolean(serviceCount), to: '/dashboard/business', action: 'Add services' },
    { label: 'Teach Delia key answers', done: Boolean(knowledgeCount), to: '/dashboard/knowledge', action: 'Add knowledge' },
    { label: 'Test a customer conversation', done: false, to: '/dashboard/chat', action: 'Run a test' },
    { label: 'Publish to your website', done: Boolean(widgetLive), to: '/dashboard/widget', action: 'Publish widget' }
  ];
  const needsServices = !serviceCount;
  const needsKnowledge = !knowledgeCount;
  const needsWebsite = !widgetLive;
  const nextAction = needsServices
    ? { label: 'Add your services', detail: 'Customers cannot book until you define what they can book.', to: '/dashboard/business' }
    : needsKnowledge
      ? { label: 'Teach Delia your top answers', detail: 'Give callers confident answers before they reach your team.', to: '/dashboard/knowledge' }
      : needsWebsite
        ? { label: 'Publish Delia to your website', detail: 'Turn the receptionist on for your visitors.', to: '/dashboard/widget' }
        : { label: 'Run a customer test', detail: 'Check the experience before your next customer does.', to: '/dashboard/receptionist' };
  const recentBookings = [...bookings]
    .sort((left, right) => +new Date(right.appointmentAt) - +new Date(left.appointmentAt))
    .slice(0, 4);
  const completedSteps = setupSteps.filter((step) => step.done).length;
  const publishingNext = nextAction.to === '/dashboard/widget';
  return (
    <WorkspaceShell>
      <div className="overview-page">
        <header className="overview-header">
          <div className="overview-title"><h1>Front desk</h1></div>
        </header>

        <section className={`overview-command ${publishingNext ? 'overview-command-publish' : ''}`} aria-label="Recommended next action">
          <span className="overview-command-icon"><Headphones /></span>
          <div><small>{widgetLive ? 'Receptionist online' : 'Your next move'}</small><h2>{nextAction.label}</h2>{publishingNext && <div className="overview-publish-path" aria-hidden="true"><span><Building2 /></span><i /><span><Headphones /></span><i /><span><MessageSquareText /></span></div>}</div>
          <Link className="button" to={nextAction.to}>{publishingNext ? 'Publish now' : 'Continue'} <ArrowRight size={15} /></Link>
        </section>

        {!widgetLive && <section className="overview-launch" aria-label="Launch progress"><div className="overview-launch-meta"><span>Launch</span><strong>{completedSteps}/{setupSteps.length}</strong></div><div className="overview-launch-track"><i style={{ width: `${(completedSteps / setupSteps.length) * 100}%` }} /></div>{setupSteps.map((step, index) => <Link key={step.label} to={step.to} className={step.done ? 'done' : ''} aria-label={step.label}>{step.done ? <CheckCircle2 size={17} /> : <span>{index + 1}</span>}</Link>)}</section>}

        <section className="overview-stats" aria-label="Workspace totals">
          <Link to="/dashboard/crm"><CalendarDays /><strong>{openBookings.length}</strong><span>Bookings</span></Link>
          <Link to="/dashboard/crm"><Building2 /><strong>{customers.length}</strong><span>Customers</span></Link>
          <Link className={knowledgeCount === 0 ? 'needs-attention' : ''} to="/dashboard/knowledge"><BookOpen /><strong>{knowledgeCount ?? '—'}</strong><span>Answers</span>{knowledgeCount === 0 && <small className="overview-stat-badge">Add answers</small>}</Link>
          <Link className={serviceCount === 0 ? 'needs-attention' : ''} to="/dashboard/business"><Settings2 /><strong>{serviceCount ?? '—'}</strong><span>Services</span>{serviceCount === 0 && <small className="overview-stat-badge">Add services</small>}</Link>
        </section>

        <section className="overview-grid">
          <article className="overview-panel overview-upcoming">
            <div className="overview-panel-header"><div><CalendarDays /><h2>Upcoming</h2></div><Link className="overview-panel-cta" to="/dashboard/crm">View calendar <ArrowRight size={15} /></Link></div>
            {openBookings.length ? <div className="overview-booking-list">{openBookings.slice(0, 3).map((booking) => <Link key={booking.id} to="/dashboard/crm"><time>{new Date(booking.appointmentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{booking.customer.name}</strong><span>{booking.service.name}</span></div><ArrowRight size={15} /></Link>)}</div> : <div className="overview-empty"><CalendarDays /><div><strong>No appointments yet</strong><p>Confirmed bookings will appear here.</p></div><Link className="overview-empty-cta" to="/dashboard/widget">Share booking link <ArrowRight size={14} /></Link></div>}
          </article>
          <article className="overview-panel overview-activity">
            <div className="overview-panel-header"><div><MessageSquareText /><h2>Activity</h2></div><Link className="overview-panel-cta" to="/dashboard/inbox">View inbox <ArrowRight size={15} /></Link></div>
            {recentBookings.length ? <div className="overview-activity-list">{recentBookings.slice(0, 3).map((booking) => <Link key={booking.id} to="/dashboard/crm"><span className="activity-mark">B</span><div><strong>{booking.customer.name}</strong><span>Booked {booking.service.name}</span></div></Link>)}</div> : <div className="overview-empty"><MessageSquareText /><div><strong>Nothing new</strong><p>Website and booking activity will show up here.</p></div><Link className="overview-empty-cta" to="/dashboard/widget">Open website <ArrowRight size={14} /></Link></div>}
          </article>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function BusinessHub() {
  return (
    <WorkspaceShell>
      <div className="business-page">
        <header className="business-page-header">
          <div>
            <h1>Business context</h1>
          </div>
          <Link className="button secondary" to="/onboarding">
            Edit details <ArrowRight size={16} />
          </Link>
        </header>
        <section className="business-context-card">
          <div className="business-context-icon"><Building2 /></div>
          <div className="business-context-copy">
            <h2>Business details</h2>
            <p>Greeting, contact details, and booking rules.</p>
          </div>
          <Link className="business-context-link" to="/onboarding" aria-label="Edit business details"><Settings2 size={19} /></Link>
        </section>
        <WorkspaceServicesManager />
      </div>
    </WorkspaceShell>
  );
}

const servicePresets = [
  { name: 'Initial consultation', durationMinutes: 30, priceLabel: 'Free', description: 'A short first conversation to understand the customer’s needs.' },
  { name: 'Standard appointment', durationMinutes: 60, priceLabel: 'From $80', description: 'A full appointment for your core service.' },
  { name: 'Follow-up appointment', durationMinutes: 30, priceLabel: 'From $50', description: 'A shorter visit for existing customers who need a follow-up.' },
  { name: 'Emergency appointment', durationMinutes: 45, priceLabel: 'Price on request', description: 'A priority appointment for urgent customer needs.' }
];

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
}

function WorkspaceServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [draft, setDraft] = useState<Omit<Service, 'id'>>({ slug: '', name: '', description: '', priceLabel: '', durationMinutes: 60, isActive: true });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const refresh = () => void getWorkspaceServices().then(setServices).catch((reason: Error) => setError(reason.message));
  useEffect(refresh, []);
  function reset() {
    setDraft({ slug: '', name: '', description: '', priceLabel: '', durationMinutes: 60, isActive: true });
    setEditing(false);
  }
  function choosePreset(preset: typeof servicePresets[number]) {
    setDraft({ ...preset, slug: slugify(preset.name), isActive: true });
    setEditing(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slug = draft.slug || slugify(draft.name);
    if (!slug) return;
    setSaving(true);
    setError('');
    try {
      await saveWorkspaceService({ ...draft, slug });
      reset();
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this service.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="services-manager">
      <div className="services-manager-header">
        <div><h2>Services</h2><p>What customers can book.</p></div>
        <button className="button" onClick={() => { reset(); setEditing(true); }}>Add service <ArrowRight size={16} /></button>
      </div>
      {services.length === 0 && !editing && <div className="empty-state service-empty"><div className="service-empty-icon"><CalendarDays /></div><div><h3>No services yet</h3><p>Choose a template to begin.</p></div></div>}
      <section className="service-templates" aria-label="Quick service templates">
        <div className="service-templates-heading"><span>QUICK START</span></div>
        <div className="service-presets">
          {servicePresets.map((preset) => <button key={preset.name} onClick={() => choosePreset(preset)}><strong>{preset.name}</strong><span>{preset.durationMinutes} min <i /> {preset.priceLabel}</span><ArrowRight size={16} /></button>)}
        </div>
      </section>
      {editing && <form className="form service-editor" onSubmit={(event) => void save(event)}>
        <div className="two-column-fields">
          <label>Service name<input value={draft.name} placeholder="e.g. Deep-clean appointment" onChange={(event) => setDraft({ ...draft, name: event.target.value, slug: draft.slug || slugify(event.target.value) })} required /></label>
          <label>Duration<select value={draft.durationMinutes} onChange={(event) => setDraft({ ...draft, durationMinutes: Number(event.target.value) })}><option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option></select></label>
        </div>
        <label>What is included?<textarea value={draft.description} placeholder="One plain-language sentence a caller would understand." onChange={(event) => setDraft({ ...draft, description: event.target.value })} required /></label>
        <div className="two-column-fields"><label>Price shown to callers<input value={draft.priceLabel} placeholder="e.g. €85 or Free" onChange={(event) => setDraft({ ...draft, priceLabel: event.target.value })} required /></label><label className="publish-toggle"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} /> Available for booking</label></div>
        {error && <p className="error">{error}</p>}
        <div className="actions"><button type="button" className="button secondary" onClick={reset}>Cancel</button><button className="button" disabled={saving}>{saving ? 'Saving…' : 'Save service'}</button></div>
      </form>}
      {services.length > 0 && <div className="workspace-service-list">{services.map((service) => <article key={service.id}><div><h3>{service.name}</h3><p>{service.description}</p><span>{service.durationMinutes} min · {service.priceLabel}</span></div><button onClick={() => { setDraft({ slug: service.slug, name: service.name, description: service.description, priceLabel: service.priceLabel, durationMinutes: service.durationMinutes, isActive: service.isActive }); setEditing(true); }}>Edit</button></article>)}</div>}
    </section>
  );
}

function KnowledgeHub() {
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [draft, setDraft] = useState<KnowledgeArticle>({
    slug: '',
    title: '',
    content: '',
    category: 'FAQ',
    isActive: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const refresh = () =>
    void getWorkspaceKnowledge()
      .then(setArticles)
      .catch((reason: Error) => setError(reason.message));
  useEffect(refresh, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const slug =
        draft.slug ||
        draft.title
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
      await saveWorkspaceKnowledge({ ...draft, slug });
      setDraft({ slug: '', title: '', content: '', category: 'FAQ', isActive: true });
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this knowledge item.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <WorkspaceShell>
      <div className="knowledge-page">
        <header className="knowledge-page-header">
          <h1>Knowledge</h1>
          <span>{articles.length} {articles.length === 1 ? 'item' : 'items'}</span>
        </header>
        <section className="knowledge-context-card">
          <div className="knowledge-context-icon"><BookOpen /></div>
          <div><h2>Approved answers</h2><p>Facts your receptionist can use.</p></div>
        </section>
        <div className="knowledge-layout">
        <section className="knowledge-form">
          <div className="knowledge-form-heading"><BookOpen /><h2>Add knowledge</h2></div>
          <form className="form" onSubmit={(event) => void save(event)}>
            <label>
              Topic
              <input
                value={draft.title}
                placeholder="e.g. Same-day appointments"
                onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                required
              />
            </label>
            <label>
              Category
              <select
                value={draft.category}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    category: event.target.value as KnowledgeArticle['category']
                  })
                }
              >
                <option value="SERVICE">Service</option>
                <option value="POLICY">Policy</option>
                <option value="FAQ">FAQ</option>
                <option value="COMPANY">Company</option>
              </select>
            </label>
            <label>
              Answer
              <textarea
                value={draft.content}
                placeholder="The approved answer for customers."
                minLength={20}
                onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                required
              />
            </label>
            <label className="publish-toggle">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
              />{' '}Publish
            </label>
            {error && <p className="error">{error}</p>}
            <button className="button" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </form>
        </section>
        <section className="knowledge-list">
          <div className="knowledge-list-heading"><BookOpen /><h2>Library</h2></div>
          {articles.length === 0 ? (
            <div className="empty-state knowledge-empty">
              <BookOpen /><div><h3>No knowledge yet</h3><p>Add a question, policy, or service detail.</p></div>
            </div>
          ) : (
            <div className="article-stack">
              {articles.map((article) => (
                <article key={article.slug} className="knowledge-item">
                  <div>
                    <span className="badge">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p>{article.content}</p>
                    <small>{article.isActive ? 'Published' : 'Draft'}</small>
                  </div>
                  <div className="knowledge-actions">
                    <button onClick={() => setDraft(article)}>Edit</button>
                    <button
                      onClick={() =>
                        void deleteWorkspaceKnowledge(article.slug)
                          .then(refresh)
                          .catch((reason: Error) => setError(reason.message))
                      }
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
        </div>
      </div>
    </WorkspaceShell>
  );
}

function WorkspaceChatLab() {
  const [sessionId, setSessionId] = useState<string>();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<
    { role: 'visitor' | 'assistant'; text: string; sources?: string[] }[]
  >([
    {
      role: 'assistant',
      text: 'This is your private test lab. Ask a customer-style question to see how your receptionist responds.'
    }
  ]);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = message.trim();
    if (!value || sending) return;
    setMessages((current) => [...current, { role: 'visitor', text: value }]);
    setMessage('');
    setSending(true);
    setError('');
    try {
      const result = await chatWithWorkspaceReceptionist(value, sessionId);
      setSessionId(result.sessionId);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: result.reply.displayText,
          sources: result.reply.citedKnowledgeIds
        }
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'The test receptionist could not answer right now.'
      );
    } finally {
      setSending(false);
    }
  }
  return (
    <WorkspaceShell eyebrow="Chat test lab" title="Test answers before your customers do.">
      <p className="workspace-lead">
        This conversation uses only your workspace’s business context and approved knowledge.
        Sources appear beneath each answer.
      </p>
      <section className="test-lab">
        <div className="test-lab-head">
          <div>
            <span className="badge">Private workspace test</span>
            <h2>Receptionist preview</h2>
          </div>
          <button
            className="button secondary"
            onClick={() => {
              setSessionId(undefined);
              setMessages([
                { role: 'assistant', text: 'Fresh test started. What would a customer ask?' }
              ]);
            }}
          >
            New test
          </button>
        </div>
        <div className="test-chat">
          {messages.map((item, index) => (
            <article key={`${item.role}-${index}`} className={`test-message ${item.role}`}>
              <p>{item.text}</p>
              {item.role === 'assistant' && (
                <small>
                  Knowledge used:{' '}
                  {item.sources?.length ? item.sources.join(', ') : 'No saved article cited'}
                </small>
              )}
            </article>
          ))}
          {sending && (
            <article className="test-message assistant">
              <p>Thinking…</p>
            </article>
          )}
        </div>
        <form className="test-composer" onSubmit={(event) => void send(event)}>
          <input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Try: “What is your cancellation policy?”"
            maxLength={1200}
          />
          <button className="button" disabled={sending}>
            <Send size={16} /> Send
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </section>
    </WorkspaceShell>
  );
}

function WorkspaceSettings() {
  const [settings, setSettings] = useState<WorkspaceSettings>();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    void getWorkspace()
      .then(({ business }) =>
        setSettings({ ...business, receptionistPersonaId: business.receptionistPersonaId || 'maya' })
      )
      .catch((reason: Error) => setError(reason.message));
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveWorkspaceSettings(settings);
      setNotice('Receptionist settings saved. Your next call will use them.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <WorkspaceShell>
      <div className="settings-page">
      <header className="settings-page-header"><h1>Settings</h1></header>
      {settings ? (
        <form className="form summary workspace-settings-form" onSubmit={(event) => void save(event)}>
          <section className="settings-voice-preview">
            <img src={`/receptionists/${settings.receptionistPersonaId === 'random' ? 'maya' : settings.receptionistPersonaId}.png`} alt="Selected receptionist" />
            <div><span>WHO ANSWERS?</span><strong>{settings.receptionistPersonaId === 'random' ? 'The Delia team' : `${settings.receptionistPersonaId.slice(0, 1).toUpperCase()}${settings.receptionistPersonaId.slice(1)}`}</strong></div>
            <select value={settings.receptionistPersonaId} onChange={(event) => setSettings({ ...settings, receptionistPersonaId: event.target.value as WorkspaceSettings['receptionistPersonaId'] })} aria-label="Who should answer?">
              <option value="random">Rotate the team</option>
              <option value="maya">Maya</option>
              <option value="sofia">Sofia</option>
              <option value="john">John</option>
              <option value="leo">Leo</option>
            </select>
          </section>
          <label>
            Who should answer?
            <select
              value={settings.receptionistPersonaId}
              onChange={(event) =>
                setSettings({
                  ...settings,
                  receptionistPersonaId: event.target.value as WorkspaceSettings['receptionistPersonaId']
                })
              }
            >
              <option value="random">Rotate the whole team</option>
              <option value="maya">Maya — warm and reassuring</option>
              <option value="sofia">Sofia — bright and attentive</option>
              <option value="john">John — calm and direct</option>
              <option value="leo">Leo — upbeat and relaxed</option>
            </select>
          </label>
          <label>
            Customer-facing greeting
            <textarea
              value={settings.greeting}
              onChange={(event) => setSettings({ ...settings, greeting: event.target.value })}
              maxLength={500}
            />
          </label>
          <label>
            Human handoff instructions
            <textarea
              value={settings.handoffInstructions}
              onChange={(event) =>
                setSettings({ ...settings, handoffInstructions: event.target.value })
              }
              maxLength={1200}
            />
          </label>
          {error && <p className="error">{error}</p>}
          {notice && <p className="success">{notice}</p>}
          <button className="button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      ) : (
        <div className="empty-state"><Settings2 /><p>Loading your workspace settings…</p></div>
      )}
      </div>
    </WorkspaceShell>
  );
}

function WebsiteWidget() {
  const [settings, setSettings] = useState<WidgetSettings>();
  const [domains, setDomains] = useState('');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [previewSession, setPreviewSession] = useState<string>();
  const [previewMessage, setPreviewMessage] = useState('');
  const [previewMessages, setPreviewMessages] = useState<{ role: 'visitor' | 'assistant'; text: string }[]>([]);
  const [transcripts, setTranscripts] = useState<WidgetTranscript[]>([]);
  const [testing, setTesting] = useState(false);
  const [confirmRotation, setConfirmRotation] = useState(false);
  const load = () => {
    void getWorkspaceWidget().then((value) => {
      setSettings(value);
      setDomains(value.allowedOrigins.join('\n'));
    }).catch((reason: Error) => setError(reason.message));
    void getWorkspaceWidgetSessions().then(setTranscripts).catch(() => undefined);
  };
  useEffect(load, []);
  const update = <K extends keyof WidgetSettings>(key: K, value: WidgetSettings[K]) =>
    setSettings((current) => current ? { ...current, [key]: value } : current);
  async function save(regenerateKey = false) {
    if (!settings) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const allowedOrigins = domains.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
      const saved = await saveWorkspaceWidget({
        allowedOrigins,
        greeting: settings.greeting,
        brandColor: settings.brandColor,
        isEnabled: settings.isEnabled,
        regenerateKey
      });
      setSettings(saved); setDomains(saved.allowedOrigins.join('\n'));
      trackUxEvent(regenerateKey ? 'widget_key_rotated' : 'widget_saved', { enabled: saved.isEnabled, origins: saved.allowedOrigins.length });
      setNotice(regenerateKey ? 'New website key created. Replace the old snippet everywhere.' : 'Website widget settings saved.');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save website widget.'); }
    finally { setSaving(false); }
  }
  async function startPreview() {
    if (!settings) return;
    setTesting(true); setError('');
    try {
      const result = await startPublicWidget(settings.publicKey);
      setPreviewSession(result.sessionId);
      setPreviewMessages([{ role: 'assistant', text: result.reply.displayText }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start widget preview.'); }
    finally { setTesting(false); }
  }
  async function sendPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings || !previewSession || !previewMessage.trim() || testing) return;
    const message = previewMessage.trim();
    setPreviewMessage(''); setPreviewMessages((items) => [...items, { role: 'visitor', text: message }]); setTesting(true);
    try {
      const result = await chatPublicWidget(settings.publicKey, previewSession, message);
      setPreviewMessages((items) => [...items, { role: 'assistant', text: result.reply.displayText }]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not send message.'); }
    finally { setTesting(false); }
  }
  const snippet = settings ? `<script src="${window.location.origin}/widget.js" data-business="${settings.publicKey}"></script>` : '';
  return (
    <WorkspaceShell>
      <div className="website-page">
      <header className="website-page-header"><div><h1>Website</h1><p>Give every visitor an instant answer.</p></div><span className={settings?.isEnabled ? 'website-status live' : 'website-status'}>{settings?.isEnabled ? 'Live' : 'Draft'}</span></header>
      {settings && <>
        <section className="publish-steps"><span className="done">1 Configure</span><span>2 Preview</span><span>3 Install</span><span className={settings.isEnabled ? 'done' : ''}>{settings.isEnabled ? 'Live' : 'Not live'}</span></section>
        <div className="widget-layout">
          <section className="summary widget-config">
            <div className="section-title"><div><h2>Widget controls</h2><p>Only websites you approve can use this key.</p></div><span className={settings.isEnabled ? 'badge' : 'badge muted'}>{settings.isEnabled ? 'Live' : 'Draft'}</span></div>
            <div className="form">
              <label>Allowed website origins<textarea value={domains} placeholder={'https://www.yourbusiness.com\nhttps://yourbusiness.com'} onChange={(event) => setDomains(event.target.value)} /><small>One exact origin per line. Add both www and non-www if you use both.</small></label>
              <label>Welcome message<textarea value={settings.greeting} placeholder="Hi, how can we help today?" maxLength={500} onChange={(event) => update('greeting', event.target.value)} /></label>
              <label>Accent color<input type="color" value={settings.brandColor} onChange={(event) => update('brandColor', event.target.value)} /></label>
              <label className="publish-toggle"><input type="checkbox" checked={settings.isEnabled} onChange={(event) => update('isEnabled', event.target.checked)} /> Enable on approved websites</label>
              {error && <p className="error">{error}</p>}{notice && <p className="success">{notice}</p>}
              <div className="actions"><button className="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save widget'}</button><button className="button secondary" onClick={() => setConfirmRotation(true)} disabled={saving}>Regenerate key</button></div>
              {confirmRotation && <section className="danger-confirm"><strong>Replace the current website snippet?</strong><p>Regenerating the key disables every existing embed until you publish the new snippet.</p><div className="actions"><button className="button secondary" onClick={() => setConfirmRotation(false)} disabled={saving}>Keep current key</button><button className="button danger" onClick={() => { setConfirmRotation(false); void save(true); }} disabled={saving}>Regenerate and invalidate old key</button></div></section>}
            </div>
          </section>
          <section className="widget-preview" style={{ '--widget-accent': settings.brandColor } as React.CSSProperties}>
            <div className="widget-preview-top"><span>Preview</span><span className="live-dot" /></div>
            {!previewSession ? <div className="widget-preview-empty"><MessageSquareText /><h3>Test it before publishing.</h3><p>This uses the same public API your website visitors will use.</p><button className="button" onClick={() => void startPreview()} disabled={testing}>Open Delia</button></div> : <><div className="widget-preview-messages">{previewMessages.map((message, index) => <p key={index} className={message.role}>{message.text}</p>)}</div><form className="widget-preview-composer" onSubmit={(event) => void sendPreview(event)}><input value={previewMessage} onChange={(event) => setPreviewMessage(event.target.value)} placeholder="Ask a customer question…" /><button disabled={testing}><Send size={16} /></button></form></>}
          </section>
        </div>
        <section className="embed-card"><div><p className="eyebrow">Install</p><h2>Copy this into your website’s HTML, just before <code>&lt;/body&gt;</code>.</h2></div><pre><code>{snippet}</code></pre><button className="button secondary" onClick={() => void navigator.clipboard.writeText(snippet)}>Copy snippet</button></section>
        <section className="widget-transcripts"><div className="section-title"><div><p className="eyebrow">Recent visitors</p><h2>Widget conversations</h2></div><button onClick={load}>Refresh</button></div>{transcripts.length === 0 ? <p className="interim">No website conversations yet.</p> : transcripts.map((session) => <article key={session.id}><strong>{session.origin}</strong><span>{new Date(session.createdAt).toLocaleString()}</span><p>{session.messages.at(-1)?.content || 'Conversation started'}</p></article>)}</section>
      </>}
      </div>
    </WorkspaceShell>
  );
}

function WorkspaceCrm() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Booking>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const refresh = () => {
    void Promise.all([getWorkspaceCrmBookings(), getWorkspaceCrmCustomers(), getWorkspaceServices()])
      .then(([nextBookings, nextCustomers, nextServices]) => { setBookings(nextBookings); setCustomers(nextCustomers); setServices(nextServices); })
      .catch((reason: Error) => setError(reason.message));
  };
  useEffect(refresh, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setError('');
    try {
      await updateWorkspaceCrmBooking(selected.id, {
        name: String(form.get('name')), phone: String(form.get('phone')), serviceId: String(form.get('serviceId')),
        appointmentAt: new Date(String(form.get('appointmentAt'))).toISOString(), notes: String(form.get('notes') || '')
      });
      setSelected(undefined); refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update booking.'); }
    finally { setSaving(false); }
  }
  async function cancel() {
    if (!selected || !window.confirm(`Cancel ${selected.customer.name}'s appointment?`)) return;
    setSaving(true); setError('');
    try { await cancelWorkspaceCrmBooking(selected.id); setSelected(undefined); refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not cancel booking.'); }
    finally { setSaving(false); }
  }
  return (
    <WorkspaceShell>
      <header className="crm-page-header"><div><h1>Bookings</h1></div><button onClick={refresh}>Refresh</button></header>
      <div className="crm-stats"><article><span>Customers</span><strong>{customers.length}</strong></article><article><span>Open bookings</span><strong>{bookings.filter((booking) => booking.status === 'OPEN').length}</strong></article><article><span>Services</span><strong>{services.length}</strong></article></div>
      <div className="crm-layout">
        <section className="crm-bookings"><div className="section-title"><div><p className="eyebrow">Appointments</p><h2>Booking pipeline</h2></div><button onClick={refresh}>Refresh</button></div>{bookings.length === 0 ? <div className="empty-state"><CalendarDays /><h3>No bookings yet.</h3><p>Confirmed appointments from Delia will appear here automatically.</p></div> : <div className="crm-list">{bookings.map((booking) => <button key={booking.id} className={selected?.id === booking.id ? 'selected' : ''} onClick={() => setSelected(booking)}><span className={`crm-status ${booking.status.toLowerCase()}`}>{booking.status}</span><strong>{booking.customer.name}</strong><small>{booking.service.name} · {new Date(booking.appointmentAt).toLocaleString()}</small></button>)}</div>}</section>
        <section className="summary crm-editor">{selected ? <form className="form" onSubmit={(event) => void save(event)}><div className="section-title"><div><p className="eyebrow">Edit appointment</p><h2>{selected.customer.name}</h2></div><button type="button" onClick={() => setSelected(undefined)}>Close</button></div><label>Name<input name="name" defaultValue={selected.customer.name} required /></label><label>Phone<input name="phone" defaultValue={selected.customer.phone} required /></label><label>Service<select name="serviceId" defaultValue={selected.service.id}>{services.map((service) => <option key={service.id} value={service.id}>{service.name} · {service.durationMinutes} min</option>)}</select></label><label>Appointment time<input name="appointmentAt" type="datetime-local" defaultValue={selected.appointmentAt.slice(0, 16)} required /></label><label>Internal note<textarea name="notes" defaultValue={selected.notes || ''} /></label>{error && <p className="error">{error}</p>}<div className="actions"><button className="button" disabled={saving || selected.status !== 'OPEN'}>{saving ? 'Saving…' : 'Save changes'}</button>{selected.status === 'OPEN' && <button type="button" className="button secondary danger" onClick={() => void cancel()} disabled={saving}>Cancel booking</button>}</div></form> : <div className="empty-state"><CalendarDays /><h3>Select an appointment.</h3><p>See the details and make a controlled change without leaving your workspace.</p></div>}</section>
      </div>
      <section className="crm-customers"><div className="section-title"><div><p className="eyebrow">Customers</p><h2>People Delia has helped</h2></div></div>{customers.length === 0 ? <p className="interim">Customers appear after the first confirmed booking.</p> : <div>{customers.map((customer) => <article key={customer.id}><strong>{customer.name}</strong><span>{customer.email} · {customer.phone}</span><small>{customer._count.bookings} booking{customer._count.bookings === 1 ? '' : 's'}</small></article>)}</div>}</section>
    </WorkspaceShell>
  );
}

function Services() {
  const [services, setServices] = useState<Service[]>([]);
  useEffect(() => {
    void getServices().then(setServices);
  }, []);
  return (
    <main className="page">
      <p className="eyebrow">Services</p>
      <h1>Choose the appointment that fits.</h1>
      <div className="service-grid">
        {services.map((s) => (
          <article key={s.id}>
            <h2>{s.name}</h2>
            <p>{s.description}</p>
            <strong>{s.priceLabel}</strong>
            <span>{s.durationMinutes} minutes</span>
            <Link className="text-link" to={`/booking?service=${s.id}`}>
              Book this service →
            </Link>
          </article>
        ))}
      </div>
    </main>
  );
}

function BookingPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState(params.get('service') || '');
  const [availability, setAvailability] = useState<{ startAt: string; available: boolean }[]>([]);
  const [selected, setSelected] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [review, setReview] = useState(false);
  const [bookingInput, setBookingInput] = useState<{
    name: string;
    email: string;
    phone: string;
    notes: string;
  }>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void getServices().then((values) => {
      setServices(values);
      if (!serviceId && values[0]) setServiceId(values[0].id);
    });
  }, []);
  useEffect(() => {
    if (serviceId)
      void getAvailability(serviceId, today)
        .then((v) => {
          const slots = v.days.flatMap((day) => day.slots);
          setAvailability(slots);
          setSelectedDate(slots.find((slot) => slot.available)?.startAt.slice(0, 10) || '');
        })
        .catch((e) => setError(e.message));
  }, [serviceId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selected) return setError('Select an available appointment time.');
    setError('');
    if (!review) {
      setBookingInput({
        name: String(form.get('name')),
        email: String(form.get('email')),
        phone: String(form.get('phone')),
        notes: String(form.get('notes') || '')
      });
      setReview(true);
      trackUxEvent('booking_reviewed', { service_selected: Boolean(serviceId) });
      return;
    }
    if (!bookingInput) return;
    setSaving(true);
    try {
      const result = await createBooking({
        ...bookingInput,
        serviceId,
        appointmentAt: selected
      });
      nav(`/manage-booking?token=${result.manageToken}&created=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create booking');
    } finally {
      setSaving(false);
    }
  }
  async function confirmBooking() {
    if (!bookingInput) return;
    setSaving(true);
    setError('');
    try {
      const result = await createBooking({ ...bookingInput, serviceId, appointmentAt: selected });
      trackUxEvent('booking_confirmed', { source: 'public_booking' });
      nav(`/manage-booking?token=${result.manageToken}&created=1`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create booking');
    } finally {
      setSaving(false);
    }
  }
  const selectedService = services.find((service) => service.id === serviceId);
  const availableDates = Array.from(
    new Set(availability.filter((slot) => slot.available).map((slot) => slot.startAt.slice(0, 10)))
  );
  const visibleSlots = availability.filter(
    (slot) => slot.available && slot.startAt.slice(0, 10) === selectedDate
  );
  if (review && bookingInput)
    return (
      <main className="page narrow booking-page">
        <p className="eyebrow">Book online · Step 3 of 3</p>
        <h1>Review your appointment.</h1>
        <p className="booking-lead">Nothing is booked until you confirm the details below.</p>
        <section className="summary booking-review">
          <h2>{selectedService?.name || 'Appointment'}</h2>
          <p>{selected ? formatTime(selected) : 'No time selected'}</p>
          <dl>
            <div><dt>Name</dt><dd>{bookingInput.name}</dd></div>
            <div><dt>Email</dt><dd>{bookingInput.email}</dd></div>
            <div><dt>Phone</dt><dd>{bookingInput.phone}</dd></div>
          </dl>
          {bookingInput.notes && <p><strong>Note:</strong> {bookingInput.notes}</p>}
          <div className="actions">
            <button className="button secondary" onClick={() => setReview(false)} disabled={saving}>Edit details</button>
            <button className="button" onClick={() => void confirmBooking()} disabled={saving}>Confirm appointment</button>
          </div>
          <small>You will receive a secure link to manage or cancel this appointment.</small>
        </section>
      </main>
    );
  return (
    <main className="page narrow booking-page">
      <p className="eyebrow">Book online · Step {selected ? '2' : '1'} of 3</p>
      <h1>Reserve an appointment.</h1>
      <p className="booking-lead">Choose a service and time first. Your details are reviewed before anything is confirmed.</p>
      <form onSubmit={submit} className="form">
        <label>
          Service
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSelected('');
              setReview(false);
            }}
            required
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.durationMinutes} min
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Choose a day, then a time</legend>
          <div className="date-picker" aria-label="Available days">
            {availableDates.map((date) => (
              <button type="button" className={selectedDate === date ? 'selected' : ''} onClick={() => { setSelectedDate(date); setSelected(''); }} key={date}>
                {new Intl.DateTimeFormat('en', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`))}
              </button>
            ))}
          </div>
          <div className="slots">
            {visibleSlots.map((slot) => (
                <button
                  type="button"
                  className={selected === slot.startAt ? 'slot selected' : 'slot'}
                  onClick={() => setSelected(slot.startAt)}
                  key={slot.startAt}
                >
                  {formatTime(slot.startAt)}
                </button>
              ))}
          </div>
        </fieldset>
        <label>
          Name
          <input name="name" minLength={2} required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Phone
          <input name="phone" minLength={7} inputMode="tel" required />
        </label>
        <label>
          Notes (optional)
          <textarea name="notes" maxLength={500} />
        </label>
        {error && <p className="error">{error}</p>}
        <p className="booking-trust">Your information is used only to arrange this appointment. You can change or cancel later from your secure link.</p>
        <button className="button" disabled={saving || !selected}>
          {saving ? 'Creating booking…' : 'Confirm booking'}
        </button>
      </form>
    </main>
  );
}

function ReceptionistBookingCard({
  sessionId,
  details
}: {
  sessionId?: string;
  details?: ReceptionistReply['bookingDetails'];
}) {
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState<{ startAt: string; available: boolean }[]>([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<{ draftId: string; confirmationText: string }>();
  const [completed, setCompleted] = useState<{ booking: Booking; manageToken: string }>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    void getServices().then((values) => {
      setServices(values);
      if (values[0]) setServiceId(values[0].id);
    });
  }, []);
  useEffect(() => {
    if (!serviceId) return;
    void getAvailability(serviceId, today)
      .then((value) => {
        setSlots(value.days.flatMap((day) => day.slots));
        setSelected('');
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : 'Could not load times')
      );
  }, [serviceId]);
  useEffect(() => {
    if (!details) return;
    if (details.name) setName(details.name);
    if (details.email) setEmail(details.email);
    if (details.phone) setPhone(details.phone);
    if (details.serviceQuery && services.length) {
      const query = details.serviceQuery.toLowerCase();
      const match = services.find(
        (service) =>
          service.name.toLowerCase().includes(query) ||
          service.slug.toLowerCase().includes(query) ||
          query.includes(service.name.toLowerCase())
      );
      if (match) setServiceId(match.id);
    }
  }, [details, services]);
  useEffect(() => {
    if (details?.wantsEarliest && !selected) {
      const earliest = slots.find((slot) => slot.available);
      if (earliest) setSelected(earliest.startAt);
    }
  }, [details?.wantsEarliest, selected, slots]);

  async function prepareBooking() {
    if (!sessionId)
      return setError('Please send a message first so I can start your booking securely.');
    if (!selected) return setError('Choose an available appointment time.');
    setSaving(true);
    setError('');
    try {
      const value = await prepareReceptionistBooking(sessionId, {
        name,
        email,
        phone,
        notes,
        serviceId,
        appointmentAt: selected
      });
      setDraft(value);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare this booking');
    } finally {
      setSaving(false);
    }
  }
  async function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await prepareBooking();
  }
  useEffect(() => {
    if (
      details?.readyToReview &&
      sessionId &&
      selected &&
      name &&
      email &&
      phone &&
      !draft &&
      !saving
    )
      void prepareBooking();
  }, [details?.readyToReview, draft, email, name, phone, saving, selected, sessionId]);

  async function confirm() {
    if (!sessionId || !draft) return;
    setSaving(true);
    setError('');
    try {
      setCompleted(await confirmReceptionistBooking(sessionId, draft.draftId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not confirm this booking');
    } finally {
      setSaving(false);
    }
  }

  if (completed)
    return (
      <section className="summary">
        <h2>Booking confirmed</h2>
        <p>{formatTime(completed.booking.appointmentAt)}</p>
        <Link className="button" to={`/manage-booking?token=${completed.manageToken}&created=1`}>
          Open your secure booking link
        </Link>
      </section>
    );
  if (draft)
    return (
      <section className="summary">
        <h2>Review your booking</h2>
        <p>{draft.confirmationText}</p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button className="button" onClick={confirm} disabled={saving}>
            {saving ? 'Confirming…' : 'Confirm booking'}
          </button>
          <button
            className="button secondary"
            onClick={() => setDraft(undefined)}
            disabled={saving}
          >
            Edit details
          </button>
        </div>
      </section>
    );
  return (
    <section className="summary">
      <h2>Book with the receptionist</h2>
      <p>Choose a live time, then review everything before the appointment is created.</p>
      <form className="form" onSubmit={review}>
        <label>
          Service
          <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} required>
            {services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name} · {service.durationMinutes} min
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Available times</legend>
          <div className="slots">
            {slots
              .filter((slot) => slot.available)
              .map((slot) => (
                <button
                  type="button"
                  className={selected === slot.startAt ? 'slot selected' : 'slot'}
                  onClick={() => setSelected(slot.startAt)}
                  key={slot.startAt}
                >
                  {formatTime(slot.startAt)}
                </button>
              ))}
          </div>
        </fieldset>
        <label>
          Name
          <input
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            minLength={2}
            required
          />
        </label>
        <label>
          Email
          <input
            name="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Phone
          <input
            name="phone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            minLength={7}
            required
          />
        </label>
        <label>
          Notes (optional)
          <textarea
            name="notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={500}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={saving || !serviceId}>
          {saving ? 'Preparing…' : 'Review booking'}
        </button>
      </form>
    </section>
  );
}

function ReceptionistPage({ workspaceMode = false }: { workspaceMode?: boolean }) {
  const [sessionId, setSessionId] = useState<string>();
  const [status, setStatus] = useState('Ready when you are. Start a call and speak naturally.');
  const [sending, setSending] = useState(false);
  const [calling, setCalling] = useState(false);
  const [receptionistName, setReceptionistName] = useState<string>();
  const [receptionistId, setReceptionistId] = useState<string>();
  const [bookingDetails, setBookingDetails] = useState<ReceptionistReply['bookingDetails']>();
  const [services, setServices] = useState<Service[]>([]);
  const [bookingSlots, setBookingSlots] = useState<{ startAt: string; available: boolean }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [bookingStage, setBookingStage] = useState<
    'collecting' | 'choose-time' | 'confirming' | 'paused' | 'completed'
  >('collecting');
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>();
  const [completedBooking, setCompletedBooking] = useState<{
    booking: Booking;
    manageToken: string;
  }>();
  const sessionRef = useRef<string>();
  const detailsRef = useRef<ReceptionistReply['bookingDetails']>();
  const slotsRef = useRef<{ startAt: string; available: boolean }[]>([]);
  const stageRef = useRef(bookingStage);
  const selectedSlotRef = useRef(selectedSlot);
  const sendingRef = useRef(false);
  const callAttemptRef = useRef(0);
  const dragStartY = useRef<number>();
  const callDragRef = useRef(0);
  const callStartedByDrag = useRef(false);
  const callButtonRef = useRef<HTMLButtonElement>(null);
  const [callDrag, setCallDrag] = useState(0);
  const [callMessage, setCallMessage] = useState('');
  const voice = useVoiceReceptionist((message) => void sendVoiceMessage(message));

  useEffect(() => {
    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.button !== 0 || !callButtonRef.current?.contains(event.target as Node)) return;
      event.preventDefault();
      startCallDragAt(event.clientY, event.pointerId);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [calling, sending]);

  useEffect(() => {
    void (workspaceMode ? getWorkspaceServices() : getServices()).then(setServices);
  }, [workspaceMode]);
  useEffect(() => {
    detailsRef.current = bookingDetails;
  }, [bookingDetails]);
  useEffect(() => {
    slotsRef.current = bookingSlots;
  }, [bookingSlots]);
  useEffect(() => {
    stageRef.current = bookingStage;
  }, [bookingStage]);
  useEffect(() => {
    selectedSlotRef.current = selectedSlot;
  }, [selectedSlot]);
  useEffect(() => {
    sendingRef.current = sending;
  }, [sending]);

  function bookingService(details = detailsRef.current) {
    const query = details?.serviceQuery?.toLowerCase();
    if (!query) return undefined;
    return services.find(
      (service) =>
        service.name.toLowerCase().includes(query) || service.slug.toLowerCase().includes(query)
    );
  }
  function setStage(next: typeof bookingStage) {
    stageRef.current = next;
    setBookingStage(next);
  }
  function mergeBookingDetails(next?: ReceptionistReply['bookingDetails']) {
    const merged = { ...detailsRef.current, ...next };
    detailsRef.current = merged;
    setBookingDetails(merged);
    return merged;
  }
  async function offerLiveSlots(details: ReceptionistReply['bookingDetails']) {
    const service = bookingService(details);
    if (!service || !details?.name || !details.email || !details.phone) return undefined;
    const availability = await (workspaceMode
      ? getWorkspaceAvailability(service.id, today)
      : getAvailability(service.id, today));
    const available = availability.days
      .flatMap((day) => day.slots)
      .filter((slot) => slot.available);
    slotsRef.current = available;
    setBookingSlots(available);
    setStage('choose-time');
    const choices = available
      .slice(0, 3)
      .map((slot, index) => `${index + 1}, ${formatTime(slot.startAt)}`)
      .join('; ');
    return choices
      ? `I've got you. I can offer ${choices}. Say first, second, or third.`
      : `I've got your details, but there are no live times available in the next week.`;
  }
  async function recoverBookingFailure(reason: unknown, activeSession: string) {
    const recovery = bookingRecoveryMessage(reason);
    setBookingDraft(undefined);
    if (recovery.includes('temporarily paused')) {
      setStage('paused');
      setStatus(recovery);
      void voice.speak(recovery, activeSession, voice.start);
      return;
    }
    const details = detailsRef.current;
    const nextTimes =
      details?.name && details.email && details.phone
        ? await offerLiveSlots(details).catch(() => undefined)
        : undefined;
    setStage(nextTimes ? 'choose-time' : 'collecting');
    const spoken = nextTimes ? `${recovery} ${nextTimes}` : recovery;
    setStatus(spoken);
    void voice.speak(spoken, activeSession, voice.start);
  }
  async function prepareSelectedSlot(slot: string) {
    const details = detailsRef.current;
    const service = bookingService(details);
    const activeSession = sessionRef.current;
    if (!activeSession || !service || !details?.name || !details.email || !details.phone) {
      setStatus('I still need your name, email, and phone before I can prepare the booking.');
      return;
    }
    setSending(true);
    try {
      const draft = await (workspaceMode
        ? prepareWorkspaceReceptionistBooking
        : prepareReceptionistBooking)(activeSession, {
        name: details.name,
        email: details.email,
        phone: details.phone,
        serviceId: service.id,
        appointmentAt: slot
      });
      selectedSlotRef.current = slot;
      setSelectedSlot(slot);
      setBookingDraft(draft);
      setStage('confirming');
      setStatus('Please review your contact details and appointment before confirming.');
      void voice.speak(
        `Please check the details: ${details.name}, ${details.phone}, ${details.email}. ${service.name} is booked for ${formatTime(slot)}. Say yes only if every detail is correct. To correct something, say change my name, phone, or email.`,
        activeSession,
        voice.start
      );
    } catch (reason) {
      await recoverBookingFailure(reason, activeSession);
    } finally {
      setSending(false);
    }
  }
  async function confirmBooking() {
    const activeSession = sessionRef.current;
    if (!activeSession || !bookingDraft) return;
    setSending(true);
    try {
      const completed = await (workspaceMode
        ? confirmWorkspaceReceptionistBooking
        : confirmReceptionistBooking)(activeSession, bookingDraft.draftId);
      setCompletedBooking(completed);
      setStage('completed');
      setStatus(`Booked for ${formatTime(completed.booking.appointmentAt)}.`);
      void voice.speak(
        `You are booked for ${formatTime(completed.booking.appointmentAt)}. Thank you. Is there anything else I can help with?`,
        activeSession,
        voice.start
      );
    } catch (reason) {
      await recoverBookingFailure(reason, activeSession);
    } finally {
      setSending(false);
    }
  }

  async function beginCall() {
    const attempt = ++callAttemptRef.current;
    setCalling(true);
    setBookingDetails(undefined);
    detailsRef.current = undefined;
    setBookingSlots([]);
    slotsRef.current = [];
    setSelectedSlot('');
    selectedSlotRef.current = '';
    setBookingDraft(undefined);
    setCompletedBooking(undefined);
    setReceptionistName(undefined);
    setReceptionistId(undefined);
    setStage('collecting');
    setStatus('Calling the receptionist…');
    try {
      // A denied or unavailable microphone should not prevent a caller from using
      // the typed in-call fallback.
      await voice.prepareMicrophone().catch(() => undefined);
      await playRingtone();
      if (callAttemptRef.current !== attempt) {
        voice.endSession();
        return;
      }
      const result = await (workspaceMode ? startWorkspaceReceptionistCall() : startReceptionistCall());
      trackUxEvent('receptionist_call_started', { workspace_mode: workspaceMode });
      if (callAttemptRef.current !== attempt) {
        voice.endSession();
        return;
      }
      sessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      setReceptionistName(result.reply.receptionist?.name);
      setReceptionistId(result.reply.receptionist?.id);
      setStatus('Connected. You can speak naturally.');
      void voice.speak(result.reply.spokenText, result.sessionId, () => {
        if (sessionRef.current === result.sessionId) voice.start();
      });
    } catch {
      if (callAttemptRef.current !== attempt) return;
      voice.endSession();
      setCalling(false);
      setStatus('The call could not connect. Please try again.');
    }
  }
  function hangUp() {
    callAttemptRef.current += 1;
    voice.endSession();
    playHangUpSound();
    setCalling(false);
    sessionRef.current = undefined;
    setSessionId(undefined);
    setReceptionistName(undefined);
    setReceptionistId(undefined);
    setStatus('Call ended.');
  }

  function startCallDragAt(clientY: number, pointerId: number) {
    if (calling || sending) return;
    dragStartY.current = clientY;
    callDragRef.current = 0;
    callStartedByDrag.current = false;
    setCallDrag(0);
    callButtonRef.current?.setPointerCapture(pointerId);
    window.addEventListener('pointermove', moveCallDragFromWindow);
    window.addEventListener('pointerup', endCallDragFromWindow);
    window.addEventListener('pointercancel', endCallDragFromWindow);
  }
  function setCallDragDistance(clientY: number) {
    if (dragStartY.current === undefined || calling) return;
    const distance = Math.min(76, Math.max(0, dragStartY.current - clientY));
    callDragRef.current = distance;
    setCallDrag(distance);
  }
  function moveCallDragFromWindow(event: globalThis.PointerEvent) {
    setCallDragDistance(event.clientY);
  }
  function finishCallDrag() {
    window.removeEventListener('pointermove', moveCallDragFromWindow);
    window.removeEventListener('pointerup', endCallDragFromWindow);
    window.removeEventListener('pointercancel', endCallDragFromWindow);
    if (calling) return;
    const shouldCall = callDragRef.current >= 58;
    dragStartY.current = undefined;
    callDragRef.current = 0;
    setCallDrag(0);
    if (shouldCall) {
      callStartedByDrag.current = true;
    }
  }
  function endCallDragFromWindow() {
    if (callButtonRef.current?.hasPointerCapture?.(0)) callButtonRef.current.releasePointerCapture(0);
    finishCallDrag();
  }

  function startCallFromButton() {
    if (calling || sending) return;
    if (callStartedByDrag.current) {
      callStartedByDrag.current = false;
      void beginCall();
      return;
    }
    void beginCall();
  }

  function submitCallMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = callMessage.trim();
    if (!message || sending) return;
    setCallMessage('');
    void sendVoiceMessage(message);
  }

  async function sendVoiceMessage(message: string) {
    if (!message || sendingRef.current) return;
    const activeSession = sessionRef.current;
    if (!activeSession) {
      setStatus('The call session was lost. Please start a new call.');
      return;
    }
    if (stageRef.current === 'completed' && isNegative(message)) {
      setStatus('Thanks for calling. Goodbye.');
      void voice.speak('Thanks for calling. Goodbye.', activeSession, hangUp);
      return;
    }
    if (isContactCorrection(message)) {
      setBookingDraft(undefined);
      setStage('collecting');
      setStatus('Updating your booking details.');
    } else if (isBookingPauseRequest(message) && stageRef.current !== 'completed') {
      setBookingDraft(undefined);
      setStage('paused');
      setStatus('Booking paused while I help with that.');
    } else if (isBookingResumeRequest(message) && stageRef.current === 'paused') {
      setStage('collecting');
      setStatus('Continuing your booking.');
    }
    if (stageRef.current === 'choose-time') {
      const slot = findOfferedSlot(message, slotsRef.current);
      if (!slot) {
        void voice.speak(
          'Please say first, second, or third, or tap one of the live times below.',
          activeSession,
          voice.start
        );
        return;
      }
      await prepareSelectedSlot(slot.startAt);
      return;
    }
    if (stageRef.current === 'confirming') {
      if (isAffirmative(message)) {
        await confirmBooking();
        return;
      }
      if (isNegative(message)) {
        setBookingDraft(undefined);
        setStage('choose-time');
        setStatus('Choose another live appointment time.');
        void voice.speak(
          'No problem. Please choose another available time.',
          activeSession,
          voice.start
        );
        return;
      }
    }
    setSending(true);
    setStatus('The receptionist is thinking…');
    try {
      const result = await (workspaceMode
        ? chatWithWorkspaceReceptionist(message, activeSession)
        : chatWithReceptionist(message, activeSession));
      sessionRef.current = result.sessionId;
      setSessionId(result.sessionId);
      if (result.reply.receptionist?.name) setReceptionistName(result.reply.receptionist.name);
      if (result.reply.receptionist?.id) setReceptionistId(result.reply.receptionist.id);
      if (result.reply.plan?.workflowStatus === 'paused') {
        setBookingDraft(undefined);
        setStage('paused');
      } else if (result.reply.plan?.workflowStatus === 'active' && stageRef.current === 'paused') {
        setStage('collecting');
      }
      let spokenText = result.reply.spokenText;
      let offeredSlots = false;
      if (result.reply.intent === 'booking' && result.reply.plan?.workflowStatus !== 'paused') {
        const previousDetails = detailsRef.current;
        const details = mergeBookingDetails(result.reply.bookingDetails);
        const savedContactDetail = ['name', 'email', 'phone'].some(
          (field) =>
            Boolean(details?.[field as keyof NonNullable<ReceptionistReply['bookingDetails']>]) &&
            !previousDetails?.[field as keyof NonNullable<ReceptionistReply['bookingDetails']>]
        );
        if (savedContactDetail) await playTypingSound();
        const slotOffer = await offerLiveSlots(details);
        if (slotOffer) {
          spokenText = slotOffer;
          offeredSlots = true;
        }
      }
      void voice.speak(spokenText, result.sessionId, () => {
        if (sessionRef.current !== result.sessionId) return;
        if (result.reply.endCall) hangUp();
        else voice.start();
      });
      setStatus(
        result.reply.intent === 'booking'
          ? offeredSlots
            ? 'Choose one of the live times, or say first, second, or third.'
            : 'I am collecting your booking details.'
          : stageRef.current === 'paused'
            ? 'Booking is paused. Ask anything, or say continue booking when you are ready.'
            : 'Listening for your next question.'
      );
    } catch {
      setStatus('The receptionist is temporarily unavailable. Please try again shortly.');
    } finally {
      setSending(false);
    }
  }

  return (
    <main className={`page receptionist-page ${workspaceMode ? 'receptionist-page-minimal' : ''}`}>
      <aside className="receptionist-roster" aria-label="Receptionist team">
        {[
          ['maya', 'Maya'],
          ['john', 'John'],
          ['sofia', 'Sofia'],
          ['leo', 'Leo']
        ].map(([id, name]) => (
          <div
            className={
              receptionistId === id ? 'receptionist-avatar answering' : 'receptionist-avatar'
            }
            key={id}
          >
            <img src={`/receptionists/${id}.png`} alt={`${name}, AI receptionist`} />
            <span>{receptionistId === id && calling ? `${name} is answering` : name}</span>
          </div>
        ))}
      </aside>
      <div className="receptionist-call-panel">
        <div className="demo-heading">
          <p className="eyebrow">Live product demo</p>
          <h1>Talk to Delia as if you were a customer.</h1>
          <p>Ask about a service, opening hours, or try to make a booking. Delia will speak back and keep a live record of the call.</p>
        </div>
        {!calling && <section className="call-start-card"><div><strong>Before you call</strong><p>Your browser will ask for microphone access. Nothing is booked without a clear confirmation.</p></div><div className="call-examples"><span>Try asking</span><button onClick={() => void beginCall()}>“Do you have anything Tuesday afternoon?”</button><button onClick={() => void beginCall()}>“What services do you offer?”</button></div></section>}
        {calling && receptionistName && (
          <p className="eyebrow">{receptionistName} is on the line</p>
        )}
        <section className="call-phone-stage">
          <div className={`call-phone ${calling ? 'is-calling' : ''}`}>
            <span className="call-phone-speaker" />
            <div className="call-phone-avatar">
              {calling && receptionistId ? <img src={`/receptionists/${receptionistId}.png`} alt={`${receptionistName || 'Receptionist'} on the call`} /> : <Headphones />}
            </div>
            <strong>{calling ? receptionistName || 'Delia' : 'Delia'}</strong>
            <span>{calling ? 'Connected' : 'AI receptionist'}</span>
            <div className="call-phone-wave" aria-hidden="true"><i /><i /><i /><i /><i /></div>
            <div className="call-phone-drag-hint" aria-hidden="true"><ChevronUp size={15} /><ChevronUp size={15} /></div>
            <button
              ref={callButtonRef}
              className={`call-phone-button ${calling ? 'hangup' : ''}`}
              style={!calling ? { transform: `translateX(-50%) translateY(${-callDrag}px) rotate(-10deg)` } : undefined}
              onClick={calling ? hangUp : startCallFromButton}
              disabled={!calling && sending}
              aria-label={calling ? 'Hang up' : 'Start a call with Delia'}
            ><PhoneCall size={25} /></button>
          </div>
        </section>
        <section className="voice-controls">
          {/* Legacy press-and-hold controls retained temporarily for source compatibility.
        <button
          className="button secondary"
          onClick={() => {
            voice.enableSpeech();
            voice.speak('Speaker test. The receptionist can now read replies aloud.');
          }}
        >
          Test device speaker
        </button>
        <button
          className="button mic"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            voice.enableSpeech();
            voice.start();
          }}
          onPointerUp={voice.stop}
          onPointerCancel={voice.stop}
          disabled={!voice.supported || sending}
        >
          {voice.listening ? 'Listening… release when finished' : 'Hold to talk'}
        </button>
        */}
          {voice.speaking && (
            <button className="button secondary" onClick={voice.stopSpeaking}>
              Stop speaking
            </button>
          )}
          {voice.interim && <span className="interim">{voice.interim}</span>}
          {voice.lastTranscript && <p className="interim">I heard: “{voice.lastTranscript}”</p>}
          {voice.voiceSource && (
            <p className="interim">
              Voice source:{' '}
              {voice.voiceSource === 'google' ? 'Google Neural2 voice' : 'browser fallback'}
            </p>
          )}
          {voice.error && <p className="error">{voice.error}</p>}
          {!voice.supported && (
            <p className="error">
              Voice recognition is not supported in this browser. Use the Chat page instead.
            </p>
          )}
        </section>
        <p className="interim" aria-live="polite">
          {status}
        </p>
        {calling && <section className="call-transcript" aria-live="polite"><strong>Live call notes</strong><p>{voice.lastTranscript ? `You said: ${voice.lastTranscript}` : 'Listening for your first question...'}</p><p>Delia: {status}</p></section>}
        {calling && (
          <form className="call-message-form" onSubmit={submitCallMessage}>
            <label htmlFor="call-message">Say it by text</label>
            <div>
              <input
                id="call-message"
                value={callMessage}
                onChange={(event) => setCallMessage(event.target.value)}
                placeholder="Ask Delia a question…"
                disabled={sending}
              />
              <button className="button" disabled={sending || !callMessage.trim()}>
                Send
              </button>
            </div>
          </form>
        )}
        {calling && services.length > 0 && bookingStage === 'collecting' && (
          <section className="caller-shortcuts">
            <p>Booking something? Choose the service instead of saying it.</p>
            <div>
              {services.map((service) => (
                <button
                  key={service.id}
                  disabled={sending}
                  onClick={() => void sendVoiceMessage(`I would like to book ${service.name}.`)}
                >
                  {service.name}
                </button>
              ))}
            </div>
          </section>
        )}
        {bookingDetails && sessionId && (
          <VoiceBookingPanel
            details={bookingDetails}
            service={bookingService()}
            slots={bookingSlots}
            selectedSlot={selectedSlot}
            stage={bookingStage}
            draft={bookingDraft}
            completed={completedBooking}
            busy={sending}
            onSelect={(slot) => void prepareSelectedSlot(slot)}
            onConfirm={() => void confirmBooking()}
          />
        )}
        {workspaceMode && completedBooking && (
          <div className="crm-booking-confirmation">
            <span>✓</span>
            <div>
              <strong>Saved to your CRM</strong>
              <p>This confirmed appointment is now in your private customer records.</p>
            </div>
            <Link to="/dashboard/crm">View in CRM</Link>
          </div>
        )}
        {!workspaceMode && sessionId && <VoiceManageBooking sessionId={sessionId} />}
      </div>
    </main>
  );
}

function VoiceBookingPanel({
  details,
  service,
  slots,
  selectedSlot,
  stage,
  draft,
  completed,
  busy,
  onSelect,
  onConfirm
}: {
  details: ReceptionistReply['bookingDetails'];
  service?: Service;
  slots: { startAt: string; available: boolean }[];
  selectedSlot: string;
  stage: 'collecting' | 'choose-time' | 'confirming' | 'paused' | 'completed';
  draft?: BookingDraft;
  completed?: { booking: Booking; manageToken: string };
  busy: boolean;
  onSelect: (slot: string) => void;
  onConfirm: () => void;
}) {
  if (completed)
    return (
      <section className="summary">
        <h2>Booking confirmed</h2>
        <p>You are booked for {formatTime(completed.booking.appointmentAt)}.</p>
        <Link className="button" to={`/manage-booking?token=${completed.manageToken}&created=1`}>
          Open your secure booking link
        </Link>
      </section>
    );
  if (stage === 'confirming' && draft)
    return (
      <section className="summary">
        <h2>Confirm your booking</h2>
        <p>{draft.confirmationText}</p>
        <p>
          Review: {details?.name || 'Name missing'} · {details?.phone || 'Phone missing'} ·{' '}
          {details?.email || 'Email missing'} · {service?.name || 'Service missing'} ·{' '}
          {selectedSlot ? formatTime(selectedSlot) : 'Time missing'}
        </p>
        <p>Say “yes” to the receptionist, or confirm here.</p>
        <button className="button" onClick={onConfirm} disabled={busy}>
          {busy ? 'Confirming…' : 'Confirm booking'}
        </button>
      </section>
    );
  if (stage === 'paused')
    return (
      <section className="summary">
        <h2>Booking paused</h2>
        <p>
          Your details are saved for this call. Ask your question, then say “continue booking”
          whenever you are ready.
        </p>
      </section>
    );
  if (stage === 'choose-time')
    return (
      <section className="summary">
        <h2>Choose a live time</h2>
        <p>Say first, second, or third—or tap a time below.</p>
        <div className="slots">
          {slots.slice(0, 3).map((slot, index) => (
            <button
              type="button"
              className={selectedSlot === slot.startAt ? 'slot selected' : 'slot'}
              onClick={() => onSelect(slot.startAt)}
              disabled={busy}
              key={slot.startAt}
            >
              {index + 1}. {formatTime(slot.startAt)}
            </button>
          ))}
        </div>
      </section>
    );
  return (
    <section className="summary">
      <h2>Your booking details</h2>
      <p>{service ? `Service: ${service.name}` : 'Service: choose this with the receptionist.'}</p>
      <p>
        Name: {details?.name || 'Still needed'} · Phone: {details?.phone || 'Still needed'} · Email:{' '}
        {details?.email || 'Still needed'}
      </p>
      <p>The receptionist will offer live times once these details are complete.</p>
    </section>
  );
}

function WorkspaceInbox() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [sessions, setSessions] = useState<WidgetTranscript[]>([]);
  useEffect(() => {
    void Promise.all([getWorkspaceCrmBookings(), getWorkspaceWidgetSessions()])
      .then(([nextBookings, nextSessions]) => { setBookings(nextBookings); setSessions(nextSessions); })
      .catch(() => undefined);
  }, []);
  const openBookings = bookings.filter((booking) => booking.status === 'OPEN').slice(0, 6);
  return (
    <WorkspaceShell>
      <div className="inbox-page">
        <header className="inbox-page-header"><h1>Inbox</h1><span>{openBookings.length + sessions.length}</span></header>
        <section className="inbox-grid">
          <article className="inbox-panel">
            <div className="inbox-panel-header"><div><CalendarDays /><h2>Bookings</h2></div><Link to="/dashboard/crm">View calendar <ArrowRight size={15} /></Link></div>
            {openBookings.length ? <div className="inbox-booking-list">{openBookings.map((booking) => <Link key={booking.id} to="/dashboard/crm"><time>{new Date(booking.appointmentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><div><strong>{booking.customer.name}</strong><span>{booking.service.name}</span></div><ArrowRight size={15} /></Link>)}</div> : <div className="inbox-empty"><CalendarDays /><span>No upcoming bookings</span></div>}
          </article>
          <article className="inbox-panel">
            <div className="inbox-panel-header"><div><MessageSquareText /><h2>Website conversations</h2></div><Link to="/dashboard/widget">Open website <ArrowRight size={15} /></Link></div>
            {sessions.length ? <div className="inbox-conversation-list">{sessions.slice(0, 6).map((session) => <Link key={session.id} to="/dashboard/widget"><span className="inbox-origin">{session.origin.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 1).toUpperCase()}</span><div><strong>{session.origin.replace(/^https?:\/\//, '').replace(/^www\./, '')}</strong><span>{session.messages.at(-1)?.content || 'Conversation started'}</span></div><time>{new Date(session.createdAt).toLocaleDateString()}</time></Link>)}</div> : <div className="inbox-empty"><MessageSquareText /><span>No website conversations</span></div>}
          </article>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function ReceptionistBuilder() {
  return (
    <WorkspaceShell>
      <div className="receptionist-hub">
        <section className="receptionist-hub-header">
          <div><h1>Receptionist</h1></div>
        </section>

        <section className="receptionist-hero-card">
          <div className="receptionist-hero-copy"><span>YOUR AI FRONT DESK</span><h2>Every caller gets your best answer.</h2><p>Delia answers, books, and follows your rules — around the clock.</p><Link className="receptionist-hero-cta" to="/dashboard/receptionist/call"><PhoneCall size={16} /> Test a live call</Link></div>
          <div className="receptionist-live-preview" aria-label="Receptionist capabilities">
            <div className="receptionist-live-orb"><Headphones /></div>
            <span><MessageSquareText size={16} /> Answer</span>
            <span><CalendarDays size={16} /> Book</span>
            <span><CheckCircle2 size={16} /> Confirm</span>
          </div>
        </section>

        <section className="receptionist-setup" aria-label="Receptionist setup">
          <div className="receptionist-setup-heading"><div><span>Build the experience</span><small>Give Delia the context to sound like your business.</small></div><strong>01 — 02</strong></div>
          <div className="receptionist-setup-grid">
            <Link to="/dashboard/business"><span className="receptionist-setup-step">01</span><span className="receptionist-setup-icon"><Building2 /></span><div><h2>Business context</h2><p>Services, policies, and booking rules.</p></div><ArrowRight size={17} /></Link>
            <Link to="/dashboard/knowledge"><span className="receptionist-setup-step">02</span><span className="receptionist-setup-icon"><BookOpen /></span><div><h2>Knowledge</h2><p>Answers your team has approved.</p></div><ArrowRight size={17} /></Link>
          </div>
        </section>
      </div>
    </WorkspaceShell>
  );
}

function WorkspaceReceptionist() {
  return (
    <WorkspaceShell><ReceptionistPage workspaceMode /></WorkspaceShell>
  );
}

function VoiceManageBooking({ sessionId }: { sessionId: string }) {
  const [token, setToken] = useState('');
  const [booking, setBooking] = useState<Booking>();
  const [draft, setDraft] = useState<BookingDraft>();
  const [slots, setSlots] = useState<{ startAt: string; available: boolean }[]>([]);
  const [selected, setSelected] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setSaving(true);
    try {
      setBooking(await getManagedBooking(token));
      setDraft(undefined);
      setRescheduling(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open booking');
    } finally {
      setSaving(false);
    }
  }
  async function cancel() {
    setSaving(true);
    try {
      setDraft(await prepareReceptionistCancel(sessionId, token));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare cancellation');
    } finally {
      setSaving(false);
    }
  }
  async function openReschedule() {
    if (!booking) return;
    setSaving(true);
    try {
      const availability = await getAvailability(booking.service.id, today);
      setSlots(availability.days.flatMap((day) => day.slots));
      setSelected('');
      setRescheduling(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load live availability');
    } finally {
      setSaving(false);
    }
  }
  async function prepareUpdate() {
    if (!booking || !selected) return setError('Choose an available appointment time first.');
    setSaving(true);
    try {
      setDraft(
        await prepareReceptionistUpdate(sessionId, {
          token,
          name: booking.customer.name,
          phone: booking.customer.phone,
          serviceId: booking.service.id,
          appointmentAt: selected,
          notes: booking.notes || ''
        })
      );
      setRescheduling(false);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the new appointment time');
    } finally {
      setSaving(false);
    }
  }
  async function confirm() {
    if (!draft) return;
    setSaving(true);
    try {
      setBooking((await confirmReceptionistAction(sessionId, draft.draftId)).booking);
      setDraft(undefined);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm action');
    } finally {
      setSaving(false);
    }
  }
  if (!booking)
    return (
      <section className="summary">
        <h2>Change or cancel an existing booking</h2>
        <p>Paste the secure booking token from your confirmation link.</p>
        <div className="inline-form">
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Secure booking token"
          />
          <button
            className="button secondary"
            type="button"
            onClick={() => void load()}
            disabled={token.length < 32 || saving}
          >
            {saving ? 'Opening…' : 'Open booking'}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </section>
    );
  return (
    <section className="summary">
      <h2>Existing booking</h2>
      <p>
        {formatTime(booking.appointmentAt)} · {booking.service.name}
      </p>
      {draft ? (
        <>
          <p>{draft.confirmationText}</p>
          <div className="actions">
            <button className="button" onClick={() => void confirm()} disabled={saving}>
              {saving ? 'Confirming…' : 'Confirm action'}
            </button>
            <button
              className="button secondary"
              onClick={() => setDraft(undefined)}
              disabled={saving}
            >
              Go back
            </button>
          </div>
        </>
      ) : rescheduling ? (
        <>
          <p>Choose a new live appointment time.</p>
          <div className="slots">
            {slots
              .filter((slot) => slot.available)
              .map((slot) => (
                <button
                  type="button"
                  className={selected === slot.startAt ? 'slot selected' : 'slot'}
                  onClick={() => setSelected(slot.startAt)}
                  key={slot.startAt}
                >
                  {formatTime(slot.startAt)}
                </button>
              ))}
          </div>
          <div className="actions">
            <button
              className="button"
              onClick={() => void prepareUpdate()}
              disabled={!selected || saving}
            >
              {saving ? 'Preparing…' : 'Review new time'}
            </button>
            <button
              className="button secondary"
              onClick={() => setRescheduling(false)}
              disabled={saving}
            >
              Keep current time
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button
            className="button secondary"
            onClick={() => void openReschedule()}
            disabled={saving}
          >
            {saving ? 'Loading…' : 'Reschedule booking'}
          </button>
          <button className="button secondary" onClick={() => void cancel()} disabled={saving}>
            Cancel booking
          </button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function ChatPage() {
  const [sessionId, setSessionId] = useState<string>();
  const [messages, setMessages] = useState<
    { role: 'visitor' | 'assistant'; text: string; citations?: string[] }[]
  >([
    {
      role: 'assistant',
      text: 'Hello. I can answer questions about this business and help you find the right booking flow.'
    }
  ]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<ReceptionistReply['bookingDetails']>();
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffSent, setHandoffSent] = useState(false);
  useEffect(() => {
    if (bookingOpen)
      window.setTimeout(
        () =>
          document
            .getElementById('booking-with-receptionist')
            ?.scrollIntoView({ behavior: 'smooth' }),
        0
      );
  }, [bookingOpen]);
  async function sendMessage(message: string) {
    if (!message || sending) return;
    setMessages((current) => [...current, { role: 'visitor', text: message }]);
    setSending(true);
    try {
      const result = await chatWithReceptionist(message, sessionId);
      setSessionId(result.sessionId);
      if (result.reply.intent === 'booking') {
        setBookingOpen(true);
        setBookingDetails((current) => ({ ...current, ...result.reply.bookingDetails }));
      }
      if (result.reply.intent === 'handoff' || result.reply.intent === 'unknown')
        setHandoffOpen(true);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: result.reply.displayText,
          citations: result.reply.citedKnowledgeIds
        }
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: 'I am temporarily unavailable. Please use the booking page or contact the team.'
        }
      ]);
    } finally {
      setSending(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    setDraft('');
    await sendMessage(message);
  }
  return (
    <main className="page narrow">
      <p className="eyebrow">AI chat</p>
      <h1>Chat with the receptionist.</h1>
      <p>Type a question to get a clear answer, sources, and help with booking.</p>
      {/* Voice controls intentionally live on the Call us page. */}
      {/*
        <button
          className="button secondary"
          onClick={() => {
            voice.enableSpeech();
            voice.speak('Speaker test. The receptionist can now read replies aloud.');
          }}
        >
          Test speaker
        </button>
        <button
          className="button mic"
          onPointerDown={(event) => {
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            voice.enableSpeech();
            voice.start();
          }}
          onPointerUp={voice.stop}
          onPointerCancel={voice.stop}
          disabled={!voice.supported || sending}
        >
          {voice.listening ? 'Listening… release when finished' : 'Hold to talk'}
        </button>
        {voice.speaking && (
          <button className="button secondary" onClick={voice.stopSpeaking}>
            Stop speaking
          </button>
        )}
        {voice.interim && <span className="interim">{voice.interim}</span>}
        {voice.error && <p className="error">{voice.error}</p>}
        {!voice.supported && (
          <p className="error">
            Voice recognition is not supported in this browser. Please use chat below.
          </p>
        )}
      */}
      <section className="chat" aria-live="polite">
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={index}>
            <strong>{message.role === 'visitor' ? 'You' : 'Receptionist'}</strong>
            <p>{message.text}</p>
            {message.citations?.length ? (
              <small>Source: {message.citations.join(', ')}</small>
            ) : null}
          </div>
        ))}
      </section>
      <form className="inline-form" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask about services, booking, or policies"
          maxLength={1200}
        />
        <button className="button" disabled={sending}>
          {sending ? 'Thinking…' : 'Send'}
        </button>
      </form>
      {bookingOpen && (
        <div id="booking-with-receptionist">
          <p className="eyebrow">Booking progress · details → time → review</p>
          <ReceptionistBookingCard sessionId={sessionId} details={bookingDetails} />
        </div>
      )}
      {handoffOpen && !handoffSent && (
        <section className="summary">
          <h2>Ask a team member to follow up</h2>
          <p>Leave your details and the team can continue this conversation.</p>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void createHandoffRequest({
                sessionId,
                name: String(form.get('name')),
                email: String(form.get('email')),
                phone: String(form.get('phone')),
                message: String(form.get('message'))
              })
                .then(() => setHandoffSent(true))
                .catch(() =>
                  setMessages((current) => [
                    ...current,
                    {
                      role: 'assistant',
                      text: 'I could not send that request. Please try again shortly.'
                    }
                  ])
                );
            }}
          >
            <label>
              Name
              <input name="name" minLength={2} required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Phone
              <input name="phone" minLength={7} required />
            </label>
            <label>
              What do you need help with?
              <textarea
                name="message"
                defaultValue={draft || 'Please follow up about my question.'}
                minLength={5}
                required
              />
            </label>
            <button className="button">Request a callback</button>
          </form>
        </section>
      )}
      {handoffSent && <p className="success">Your request has been sent to the team.</p>}
    </main>
  );
}

function ManageBooking() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [booking, setBooking] = useState<Booking | null>(null);
  const [available, setAvailable] = useState<{ startAt: string; available: boolean }[]>([]);
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState(
    params.get('created') ? 'Booking created. Keep this page or link to manage it later.' : ''
  );
  useEffect(() => {
    if (token)
      void getManagedBooking(token)
        .then(setBooking)
        .catch((e) => setError(e.message));
  }, [token]);
  useEffect(() => {
    if (booking && editing)
      void getAvailability(booking.service.id, today)
        .then((v) => setAvailable(v.days.flatMap((day) => day.slots)))
        .catch((e) => setError(e.message));
  }, [booking, editing]);
  async function cancel() {
    if (!token || !confirm('Cancel this booking?')) return;
    try {
      setBooking(await cancelManagedBooking(token));
      setMessage('Booking cancelled.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not cancel');
    }
  }
  async function reschedule() {
    if (!booking || !selected) return setError('Select a new available time.');
    try {
      const next = await updateManagedBooking({
        token,
        name: booking.customer.name,
        phone: booking.customer.phone,
        serviceId: booking.service.id,
        appointmentAt: selected,
        notes: booking.notes || ''
      });
      setBooking(next);
      setEditing(false);
      setMessage('Booking updated.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update booking');
    }
  }
  if (!token)
    return (
      <main className="page narrow">
        <h1>Manage your booking</h1>
        <p className="error">Open the secure link provided after booking.</p>
      </main>
    );
  if (error && !booking)
    return (
      <main className="page narrow">
        <h1>Manage your booking</h1>
        <p className="error">{error}</p>
      </main>
    );
  if (!booking)
    return (
      <main className="page narrow">
        <LoaderCircle className="spin" /> Loading booking…
      </main>
    );
  return (
    <main className="page narrow">
      <p className="eyebrow">Secure booking management</p>
      <h1>Your appointment</h1>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <article className="summary">
        <h2>{booking.service.name}</h2>
        <p>{formatTime(booking.appointmentAt)}</p>
        <p>
          {booking.customer.name} · {booking.customer.email}
        </p>
        <span className="badge">{booking.status}</span>
      </article>
      {booking.status === 'OPEN' && (
        <div className="actions">
          <button className="button secondary" onClick={() => setEditing(!editing)}>
            {editing ? 'Close reschedule' : 'Reschedule'}
          </button>
          <button className="button danger" onClick={cancel}>
            Cancel booking
          </button>
        </div>
      )}
      {editing && (
        <section className="reschedule">
          <h2>Choose a new time</h2>
          <div className="slots">
            {available
              .filter((s) => s.available)
              .map((slot) => (
                <button
                  className={selected === slot.startAt ? 'slot selected' : 'slot'}
                  onClick={() => setSelected(slot.startAt)}
                  key={slot.startAt}
                >
                  {formatTime(slot.startAt)}
                </button>
              ))}
          </div>
          <button className="button" onClick={reschedule}>
            Confirm new appointment
          </button>
        </section>
      )}
    </main>
  );
}

function Admin() {
  const [token, setToken] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [settings, setSettings] = useState<ReceptionistSettings>();
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  const [insights, setInsights] = useState<{
    activeArticles: number;
    draftArticles: number;
    openQuestions: { id: string; question: string }[];
    openHandoffs: { id: string; name: string; email: string; phone: string; message: string }[];
  }>();
  const [article, setArticle] = useState<KnowledgeArticle>({
    slug: '',
    title: '',
    content: '',
    category: 'FAQ',
    sourceLabel: '',
    isActive: false
  });
  const [testQuestion, setTestQuestion] = useState('What services do you offer?');
  const [testReply, setTestReply] = useState<ReceptionistReply>();
  const [error, setError] = useState('');
  const refresh = async (adminToken = token) => {
    const [b, s, nextSettings, nextArticles, nextInsights] = await Promise.all([
      getAdminBookings(adminToken),
      getAdminServices(adminToken),
      getReceptionistSettings(adminToken),
      getKnowledge(adminToken),
      getKnowledgeInsights(adminToken)
    ]);
    setBookings(b);
    setServices(s);
    setSettings(nextSettings);
    setArticles(nextArticles);
    setInsights(nextInsights);
  };
  async function load(event: FormEvent) {
    event.preventDefault();
    try {
      await refresh();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load admin data');
    }
  }
  async function addService() {
    try {
      await saveAdminService(token, {
        slug: `service-${Date.now()}`,
        name: 'New service',
        description: 'Update this service in a future admin editor.',
        priceLabel: 'Quote',
        durationMinutes: 60,
        isActive: true
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add service');
    }
  }
  async function saveSettings() {
    if (!settings) return;
    try {
      setSettings(await saveReceptionistSettings(token, settings));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save settings');
    }
  }
  async function saveArticle(event: FormEvent) {
    event.preventDefault();
    try {
      const saved = await saveKnowledge(token, {
        ...article,
        slug:
          article.slug ||
          article.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
      });
      setArticle({
        slug: '',
        title: '',
        content: '',
        category: 'FAQ',
        sourceLabel: '',
        isActive: false
      });
      setArticles((current) =>
        [...current.filter((item) => item.slug !== saved.slug), saved].sort((a, b) =>
          a.title.localeCompare(b.title)
        )
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save knowledge');
    }
  }
  async function testReceptionist() {
    try {
      setTestReply((await chatWithReceptionist(testQuestion)).reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not test receptionist');
    }
  }
  return (
    <main className="page">
      <p className="eyebrow">Admin operations</p>
      <h1>Owner workspace</h1>
      <form className="inline-form" onSubmit={load}>
        <input
          aria-label="Admin API token"
          type="password"
          placeholder="Admin API token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
        />
        <button className="button">Load admin data</button>
      </form>
      {error && <p className="error">{error}</p>}
      {token && (
        <>
          {settings && (
            <section className="summary">
              <div className="section-title">
                <h2>Receptionist configuration</h2>
                <button className="button" onClick={saveSettings}>
                  Save settings
                </button>
              </div>
              <label>
                Business name
                <input
                  value={settings.businessName}
                  onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                />
              </label>
              <label>
                About the company
                <textarea
                  value={settings.companyDescription}
                  onChange={(e) => setSettings({ ...settings, companyDescription: e.target.value })}
                />
              </label>
              <label>
                Greeting
                <input
                  value={settings.greeting}
                  onChange={(e) => setSettings({ ...settings, greeting: e.target.value })}
                />
              </label>
              <label>
                Response style
                <select
                  value={
                    tonePresets.some((preset) => preset.value === settings.assistantTone)
                      ? settings.assistantTone
                      : 'custom'
                  }
                  onChange={(event) => {
                    const preset = tonePresets.find((item) => item.value === event.target.value);
                    if (preset) setSettings({ ...settings, assistantTone: preset.value });
                  }}
                >
                  {tonePresets.map((preset) => (
                    <option key={preset.label} value={preset.value}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom style below</option>
                </select>
              </label>
              <label>
                Custom response-style instructions
                <textarea
                  value={settings.assistantTone}
                  onChange={(e) => setSettings({ ...settings, assistantTone: e.target.value })}
                  maxLength={160}
                  placeholder="For example: warm, casual, and reassuring; say ‘I’ve got you’ naturally."
                />
              </label>
              <label>
                Booking instructions
                <textarea
                  value={settings.bookingInstructions}
                  onChange={(e) =>
                    setSettings({ ...settings, bookingInstructions: e.target.value })
                  }
                />
              </label>
              <label>
                Handoff instructions
                <textarea
                  value={settings.handoffInstructions}
                  onChange={(e) =>
                    setSettings({ ...settings, handoffInstructions: e.target.value })
                  }
                />
              </label>
              <label>
                Contact details
                <textarea
                  value={settings.contactDetails}
                  onChange={(e) => setSettings({ ...settings, contactDetails: e.target.value })}
                />
              </label>
            </section>
          )}
          <section className="summary">
            <div className="section-title">
              <h2>Knowledge hub</h2>
              <span>
                {insights?.activeArticles ?? 0} live · {insights?.draftArticles ?? 0} drafts
              </span>
            </div>
            <p>
              Paste approved company information below. Drafts stay out of receptionist answers
              until you publish them.
            </p>
            <form className="form" onSubmit={saveArticle}>
              <label>
                Title
                <input
                  value={article.title}
                  onChange={(e) => setArticle({ ...article, title: e.target.value })}
                  required
                />
              </label>
              <label>
                Category
                <select
                  value={article.category}
                  onChange={(e) =>
                    setArticle({
                      ...article,
                      category: e.target.value as KnowledgeArticle['category']
                    })
                  }
                >
                  <option>COMPANY</option>
                  <option>SERVICE</option>
                  <option>POLICY</option>
                  <option>FAQ</option>
                  <option>PROMOTION</option>
                  <option>INTERNAL</option>
                </select>
              </label>
              <label>
                Source label (optional)
                <input
                  value={article.sourceLabel || ''}
                  placeholder="Website, brochure, owner notes"
                  onChange={(e) => setArticle({ ...article, sourceLabel: e.target.value })}
                />
              </label>
              <label>
                Approved information
                <textarea
                  value={article.content}
                  minLength={20}
                  onChange={(e) => setArticle({ ...article, content: e.target.value })}
                  required
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={article.isActive}
                  onChange={(e) => setArticle({ ...article, isActive: e.target.checked })}
                />{' '}
                Publish for receptionist use
              </label>
              <button className="button">Save knowledge</button>
            </form>
            <div className="table">
              {articles.map((item) => (
                <p key={item.slug}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.category} · {item.isActive ? 'Live' : 'Draft'}{' '}
                    <button className="text-link" onClick={() => setArticle(item)}>
                      Edit
                    </button>{' '}
                    <button
                      className="text-link"
                      onClick={() =>
                        void deleteKnowledge(token, item.slug)
                          .then(() => refresh())
                          .catch((e: Error) => setError(e.message))
                      }
                    >
                      Delete
                    </button>
                  </span>
                </p>
              ))}
            </div>
          </section>
          <section className="summary">
            <h2>Live receptionist test</h2>
            <p>Ask a customer-style question. Sources show exactly what the answer used.</p>
            <div className="inline-form">
              <input value={testQuestion} onChange={(e) => setTestQuestion(e.target.value)} />
              <button className="button" type="button" onClick={testReceptionist}>
                Test answer
              </button>
            </div>
            {testReply && (
              <article className="message assistant">
                <p>{testReply.displayText}</p>
                <small>
                  Intent: {testReply.intent} · Sources:{' '}
                  {testReply.citedKnowledgeIds.join(', ') || 'none'}
                </small>
              </article>
            )}
          </section>
          {insights?.openQuestions.length ? (
            <section>
              <h2>Knowledge to improve</h2>
              <div className="table">
                {insights.openQuestions.map((item) => (
                  <p key={item.id}>{item.question}</p>
                ))}
              </div>
            </section>
          ) : null}
          {insights?.openHandoffs.length ? (
            <section>
              <h2>Follow-up requests</h2>
              <div className="table">
                {insights.openHandoffs.map((item) => (
                  <p key={item.id}>
                    <strong>{item.name}</strong>
                    <span>
                      {item.email} · {item.phone} · {item.message}
                    </span>
                  </p>
                ))}
              </div>
            </section>
          ) : null}
          <section>
            <div className="section-title">
              <h2>Services</h2>
              <button className="button secondary" onClick={addService}>
                Add service
              </button>
            </div>
            <div className="table">
              {services.map((s) => (
                <p key={s.id}>
                  <strong>{s.name}</strong>
                  <span>
                    {s.priceLabel} · {s.durationMinutes} min
                  </span>
                </p>
              ))}
            </div>
          </section>
          <section>
            <h2>Upcoming and past bookings</h2>
            <div className="table">
              {bookings.map((b) => (
                <p key={b.id}>
                  <strong>{b.customer.name}</strong>
                  <span>
                    {b.service.name} · {formatTime(b.appointmentAt)} · {b.status}
                  </span>
                </p>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route
          path="/onboarding"
          element={
            <RequireAccount>
              <Onboarding />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard"
          element={
            <RequireAccount>
              <WorkspaceDashboard />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/business"
          element={
            <RequireAccount>
              <BusinessHub />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/knowledge"
          element={
            <RequireAccount>
              <KnowledgeHub />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/chat"
          element={
            <RequireAccount>
              <WorkspaceChatLab />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/receptionist"
          element={
            <RequireAccount>
              <ReceptionistBuilder />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/receptionist/call"
          element={
            <RequireAccount>
              <WorkspaceReceptionist />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/inbox"
          element={
            <RequireAccount>
              <WorkspaceInbox />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/widget"
          element={
            <RequireAccount>
              <WebsiteWidget />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/crm"
          element={
            <RequireAccount>
              <WorkspaceCrm />
            </RequireAccount>
          }
        />
        <Route
          path="/dashboard/settings"
          element={
            <RequireAccount>
              <WorkspaceSettings />
            </RequireAccount>
          }
        />
        <Route path="/services" element={<Services />} />
        <Route path="/receptionist" element={<ReceptionistPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/booking" element={<BookingPage />} />
        <Route path="/manage-booking" element={<ManageBooking />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  );
}
