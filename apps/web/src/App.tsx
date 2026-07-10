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
  BookOpen,
  Building2,
  CalendarDays,
  Headphones,
  LayoutDashboard,
  LoaderCircle,
  MessageSquareText,
  Mic,
  Send,
  Settings2
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
          <img src="/delia-logo.svg" alt="Delia" />
        </Link>
        <nav>
          <NavLink to="/receptionist">Live demo</NavLink>
          <NavLink to="/login">Sign in</NavLink>
          <Link className="button header-cta" to="/signup">
            Start free
          </Link>
        </nav>
      </header>}
      {children}
      <footer>Delia · Clear answers. Confirmed appointments.</footer>
    </>
  );
}

function Home() {
  return (
    <main>
      <section className="hero hero-split">
        <div className="hero-copy">
          <p className="eyebrow">AI receptionists for service businesses</p>
          <h1>Never miss the next customer who calls.</h1>
          <p>
            Give every caller a warm, informed receptionist that answers questions, collects
            details, and guides bookings around the clock.
          </p>
          <div className="actions">
            <Link className="button" to="/signup">
              Build your receptionist free
            </Link>
            <Link className="button secondary" to="/receptionist">
              Try the live demo
            </Link>
          </div>
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
          <div className="glimpse-message assistant">Hi, I’m Maya. How can I help today?</div>
          <div className="glimpse-message caller">I’d like to book a consultation.</div>
          <div className="glimpse-message assistant">Absolutely. What name should I use?</div>
          <div className="glimpse-footer">
            <span>Listening…</span>
            <span className="sound-bars">▮▮▮▮</span>
          </div>
        </div>
      </section>
      <section className="feature-grid">
        <article>
          <Mic />
          <h2>Sounds present</h2>
          <p>
            Natural voices, a real call flow, and respectful handling when someone needs a moment.
          </p>
        </article>
        <article>
          <MessageSquareText />
          <h2>Learns your business</h2>
          <p>
            Guide it through your services, policies, FAQs, and handoff rules—without prompt
            engineering.
          </p>
        </article>
        <article>
          <CalendarDays />
          <h2>Works with intent</h2>
          <p>
            It keeps booking details straight, confirms changes, and knows when to bring in a
            person.
          </p>
        </article>
      </section>
      <section className="info">
        <Headphones />
        <div>
          <h2>Your receptionist, ready in minutes</h2>
          <p>
            Start free, answer guided questions about your business, then test every response before
            going live.
          </p>
        </div>
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
      <section className="summary auth-card">
        <p className="eyebrow">{signingUp ? 'Start your free workspace' : 'Welcome back'}</p>
        <h1>
          {signingUp
            ? 'Build the receptionist your customers deserve.'
            : 'Sign in to your workspace.'}
        </h1>
        <p>
          {signingUp
            ? 'No credit card. Your business information stays private to your workspace.'
            : 'Continue setting up and testing your AI receptionist.'}
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
              {industryOptions.map((industry) => <button type="button" key={industry} className={values.industry === industry ? 'selected' : ''} onClick={() => update('industry', industry)}>{industry}</button>)}
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
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  const [account, setAccount] = useState<Account>();
  useEffect(() => {
    void getCurrentAccount()
      .then(setAccount)
      .catch(() => undefined);
  }, []);
  return (
    <main className="workspace-page">
      <aside className="workspace-sidebar">
        <Link className="workspace-brand" to="/dashboard">
          <img src="/delia-logo.svg" alt="Delia" />
        </Link>
        <p className="workspace-name">{account?.workspaceName || 'Loading workspace…'}</p>
        <nav className="workspace-nav">
          <NavLink to="/dashboard" end>
            <LayoutDashboard /> Overview
          </NavLink>
          <NavLink to="/dashboard/business">
            <Building2 /> Business info
          </NavLink>
          <NavLink to="/dashboard/knowledge">
            <BookOpen /> Knowledge
          </NavLink>
          <NavLink to="/dashboard/chat">
            <MessageSquareText /> Chat test lab
          </NavLink>
          <NavLink to="/dashboard/receptionist">
            <Headphones /> Live receptionist
          </NavLink>
          <NavLink to="/dashboard/widget">
            <MessageSquareText /> Website widget
          </NavLink>
          <NavLink to="/dashboard/settings">
            <Settings2 /> Settings
          </NavLink>
        </nav>
        <div className="workspace-profile">
          <span>{account?.email}</span>
          <button onClick={() => void logout().then(() => nav('/'))}>Sign out</button>
        </div>
      </aside>
      <section className="workspace-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

function WorkspaceDashboard() {
  const [knowledgeCount, setKnowledgeCount] = useState<number>();
  useEffect(() => {
    void getWorkspaceKnowledge()
      .then((articles) => setKnowledgeCount(articles.length))
      .catch(() => setKnowledgeCount(0));
  }, []);
  return (
    <WorkspaceShell eyebrow="Workspace overview" title="Build a receptionist your customers trust.">
      <p className="workspace-lead">
        Everything here is private to your business. Add accurate facts, test the answers, then move
        to the live receptionist when you are ready.
      </p>
      <div className="readiness-card">
        <div>
          <span className="badge">Setup progress</span>
          <h2>Your receptionist foundation is in place.</h2>
          <p>
            Business information is connected. Add knowledge next so it can answer the questions
            customers actually ask.
          </p>
        </div>
        <Link className="button" to="/dashboard/knowledge">
          Add business knowledge
        </Link>
      </div>
      <div className="dashboard-grid">
        <Link to="/dashboard/business" className="dashboard-card">
          <Building2 />
          <span>01</span>
          <h2>Business information</h2>
          <p>
            Review the business details, tone, booking, and handoff guidance your receptionist uses.
          </p>
          <strong>Review context →</strong>
        </Link>
        <Link to="/dashboard/knowledge" className="dashboard-card">
          <BookOpen />
          <span>02</span>
          <h2>Knowledge library</h2>
          <p>
            {knowledgeCount === undefined
              ? 'Checking your knowledge…'
              : `${knowledgeCount} approved item${knowledgeCount === 1 ? '' : 's'} ready for answers.`}
          </p>
          <strong>Manage knowledge →</strong>
        </Link>
        <Link to="/dashboard/chat" className="dashboard-card">
          <MessageSquareText />
          <span>03</span>
          <h2>Chat test lab</h2>
          <p>
            Ask customer-style questions and see exactly which approved knowledge informed the
            answer.
          </p>
          <strong>Test your receptionist →</strong>
        </Link>
        <Link to="/dashboard/receptionist" className="dashboard-card">
          <Headphones />
          <span>04</span>
          <h2>Live receptionist</h2>
          <p>Call the receptionist your customers will reach, using this workspace’s context.</p>
          <strong>Start a private call →</strong>
        </Link>
      </div>
    </WorkspaceShell>
  );
}

function BusinessHub() {
  return (
    <WorkspaceShell eyebrow="Business context" title="Give your receptionist the right facts, fast.">
      <p className="workspace-lead">
        Start with the few details callers need most. Clear services and simple rules prevent
        guesswork and make every answer sound like it came from your team.
      </p>
      <div className="business-hub-card">
        <div>
          <Building2 />
          <h2>Core business details</h2>
          <p>
            Business type, customer-facing description, contact details, greeting, booking guidance,
            and human handoff rules.
          </p>
        </div>
        <Link className="button" to="/onboarding">
          Review core details
        </Link>
      </div>
      <div className="context-checklist">
        <span>✓ Structured facts, not an unbounded prompt</span>
        <span>✓ Private to this workspace</span>
        <span>✓ Used by chat testing and the live receptionist</span>
      </div>
      <WorkspaceServicesManager />
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
      <div className="section-title">
        <div><p className="eyebrow">Appointments</p><h2>What can customers book?</h2><p>Only active services are offered by the receptionist. Add your real services before testing a call.</p></div>
        <button className="button secondary" onClick={() => { reset(); setEditing(true); }}>Add a service</button>
      </div>
      {services.length === 0 && !editing && <div className="empty-state service-empty"><CalendarDays /><h3>Start with your most common appointment.</h3><p>Pick a starting point below, then change the wording, duration, or price.</p></div>}
      <div className="service-presets" aria-label="Quick service templates">
        {servicePresets.map((preset) => <button key={preset.name} onClick={() => choosePreset(preset)}><strong>{preset.name}</strong><span>{preset.durationMinutes} min · {preset.priceLabel}</span></button>)}
      </div>
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
    <WorkspaceShell eyebrow="Knowledge library" title="Give your receptionist approved answers.">
      <p className="workspace-lead">
        Add clear, customer-safe information one subject at a time. Drafts stay private until you
        publish them.
      </p>
      <div className="knowledge-layout">
        <section className="summary knowledge-form">
          <h2>Add knowledge</h2>
          <form className="form" onSubmit={(event) => void save(event)}>
            <label>
              What should the receptionist know?
              <input
                value={draft.title}
                placeholder="e.g. Same-day repair appointments"
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
              Approved answer
              <textarea
                value={draft.content}
                placeholder="Write the facts the receptionist can confidently share. Include boundaries or exceptions when they matter."
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
              />{' '}
              Publish for receptionist use
            </label>
            {error && <p className="error">{error}</p>}
            <button className="button" disabled={saving}>
              {saving ? 'Saving…' : 'Save knowledge'}
            </button>
          </form>
        </section>
        <section className="knowledge-list">
          <div className="section-title">
            <div>
              <h2>Library</h2>
              <p>
                {articles.length} item{articles.length === 1 ? '' : 's'} in this workspace
              </p>
            </div>
          </div>
          {articles.length === 0 ? (
            <div className="empty-state">
              <BookOpen />
              <h3>Start with your most asked question.</h3>
              <p>A clear policy, service description, or FAQ is a great first item.</p>
            </div>
          ) : (
            <div className="article-stack">
              {articles.map((article) => (
                <article key={article.slug} className="knowledge-item">
                  <div>
                    <span className="badge">{article.category}</span>
                    <h3>{article.title}</h3>
                    <p>{article.content}</p>
                    <small>
                      {article.isActive ? 'Published for answers' : 'Draft — not used in answers'}
                    </small>
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
    <WorkspaceShell eyebrow="Receptionist settings" title="Make your call experience yours.">
      <p className="workspace-lead">
        Choose who answers new calls. The receptionist still follows your business information,
        knowledge library, availability, and booking rules.
      </p>
      {settings ? (
        <form className="form summary workspace-settings-form" onSubmit={(event) => void save(event)}>
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
            {saving ? 'Saving…' : 'Save receptionist settings'}
          </button>
        </form>
      ) : (
        <div className="empty-state"><Settings2 /><p>Loading your workspace settings…</p></div>
      )}
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
    <WorkspaceShell eyebrow="Customer-facing" title="Put Delia on your website.">
      <p className="workspace-lead">Turn your trained receptionist into a safe website concierge. Visitors can ask questions, choose a service, and book without dashboard access.</p>
      {settings && <>
        <div className="widget-layout">
          <section className="summary widget-config">
            <div className="section-title"><div><h2>Widget controls</h2><p>Only websites you approve can use this key.</p></div><span className={settings.isEnabled ? 'badge' : 'badge muted'}>{settings.isEnabled ? 'Live' : 'Draft'}</span></div>
            <div className="form">
              <label>Allowed website origins<textarea value={domains} placeholder={'https://www.yourbusiness.com\nhttps://yourbusiness.com'} onChange={(event) => setDomains(event.target.value)} /><small>One exact origin per line. Add both www and non-www if you use both.</small></label>
              <label>Welcome message<textarea value={settings.greeting} placeholder="Hi, how can we help today?" maxLength={500} onChange={(event) => update('greeting', event.target.value)} /></label>
              <label>Accent color<input type="color" value={settings.brandColor} onChange={(event) => update('brandColor', event.target.value)} /></label>
              <label className="publish-toggle"><input type="checkbox" checked={settings.isEnabled} onChange={(event) => update('isEnabled', event.target.checked)} /> Enable on approved websites</label>
              {error && <p className="error">{error}</p>}{notice && <p className="success">{notice}</p>}
              <div className="actions"><button className="button" onClick={() => void save()} disabled={saving}>{saving ? 'Saving…' : 'Save widget'}</button><button className="button secondary" onClick={() => void save(true)} disabled={saving}>Regenerate key</button></div>
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
    <WorkspaceShell eyebrow="Internal CRM" title="Every customer interaction, in one place.">
      <p className="workspace-lead">Delia writes confirmed bookings here automatically. You stay in control: review customers, update an appointment, or cancel it safely.</p>
      <div className="crm-stats"><article><span>Customers</span><strong>{customers.length}</strong></article><article><span>Open bookings</span><strong>{bookings.filter((booking) => booking.status === 'OPEN').length}</strong></article><article><span>AI-created records</span><strong>Workspace private</strong></article></div>
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
        .then((v) => setAvailability(v.days.flatMap((day) => day.slots)))
        .catch((e) => setError(e.message));
  }, [serviceId]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (!selected) return setError('Select an available appointment time.');
    setSaving(true);
    setError('');
    try {
      const result = await createBooking({
        name: String(form.get('name')),
        email: String(form.get('email')),
        phone: String(form.get('phone')),
        notes: String(form.get('notes') || ''),
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
  return (
    <main className="page narrow">
      <p className="eyebrow">Book online</p>
      <h1>Reserve an appointment.</h1>
      <form onSubmit={submit} className="form">
        <label>
          Service
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setSelected('');
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
          <legend>Available times</legend>
          <div className="slots">
            {availability
              .filter((s) => s.available)
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
          Notes (optional)
          <textarea name="notes" maxLength={500} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="button" disabled={saving}>
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
  const voice = useVoiceReceptionist((message) => void sendVoiceMessage(message));

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
    return (
      services.find(
        (service) =>
          query &&
          (service.name.toLowerCase().includes(query) || service.slug.toLowerCase().includes(query))
      ) || services[0]
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
      setStatus('Your appointment is ready for confirmation.');
      void voice.speak(
        `I've got ${formatTime(slot)} ready for ${details.name}. Say yes, or press Confirm booking, to book it.`,
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
      await voice.prepareMicrophone();
      await playRingtone();
      if (callAttemptRef.current !== attempt) {
        voice.endSession();
        return;
      }
      const result = await (workspaceMode ? startWorkspaceReceptionistCall() : startReceptionistCall());
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
    <main className="page receptionist-page">
      <aside className="receptionist-roster" aria-label="Receptionist team">
        <p className="eyebrow">Meet the team</p>
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
        <p className="eyebrow">Voice AI receptionist</p>
        <h1>Call the receptionist.</h1>
        <p>
          Start a call and speak naturally. The receptionist listens between replies, just like a
          phone call.
        </p>
        {calling && receptionistName && (
          <p className="eyebrow">{receptionistName} is on the line</p>
        )}
        <section className="voice-controls">
          {!calling ? (
            <button
              className="button mic"
              onClick={() => void beginCall()}
              disabled={!voice.supported || sending}
            >
              Call receptionist
            </button>
          ) : (
            <button className="button secondary" onClick={hangUp}>
              Hang up
            </button>
          )}
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

function WorkspaceReceptionist() {
  return (
    <WorkspaceShell eyebrow="Live receptionist" title="Try the receptionist your customers hear.">
      <p className="workspace-lead">
        This is a private call. It uses this workspace’s business details, knowledge, services,
        availability, and booking records.
      </p>
      <ReceptionistPage workspaceMode />
    </WorkspaceShell>
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
              <WorkspaceReceptionist />
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
