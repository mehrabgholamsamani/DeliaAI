import { FormEvent, useState } from 'react';
import { ArrowRight, Building2, Eye, EyeOff, Lock, Mail } from 'lucide-react';

export type AuthMode = 'login' | 'signup';

type PremiumAuthProps = {
  initialMode: AuthMode;
  loading?: boolean;
  error?: string;
  googleEnabled?: boolean;
  onModeChange: (mode: AuthMode) => void;
  onSubmit: (data: { email: string; password: string; businessName: string }) => void;
  onGoogle: () => void;
};

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.4Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.37l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.92A6.01 6.01 0 0 1 6.08 12c0-.67.11-1.32.31-1.92V7.46H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.54l3.35-2.62Z" />
      <path fill="#EA4335" d="M12 5.95c1.47 0 2.79.51 3.83 1.5l2.87-2.88A9.63 9.63 0 0 0 12 2a10 10 0 0 0-8.96 5.46l3.35 2.62C7.18 7.71 9.39 5.95 12 5.95Z" />
    </svg>
  );
}

export function PremiumAuth({
  initialMode,
  loading = false,
  error,
  googleEnabled = false,
  onModeChange,
  onSubmit,
  onGoogle
}: PremiumAuthProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    onModeChange(nextMode);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (rememberMe && mode === 'login') localStorage.setItem('userEmail', email);
    onSubmit({ email, password, businessName });
  }

  const signingUp = mode === 'signup';
  return (
    <section className="premium-auth" aria-labelledby="auth-title">
      <div className="premium-auth-heading">
        <h1 id="auth-title">{signingUp ? 'Create Account' : 'Welcome Back'}</h1>
        <p>{signingUp ? 'Create your free Delia workspace' : 'Sign in to your account'}</p>
      </div>

      <div className="premium-auth-tabs" aria-label="Authentication mode">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Login</button>
        <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => switchMode('signup')}>Sign Up</button>
      </div>

      <form onSubmit={submit}>
        {signingUp && (
          <label className="premium-auth-field">
            <Building2 aria-hidden="true" />
            <input aria-label="Business name" autoComplete="organization" minLength={2} maxLength={120} placeholder="Business Name" required value={businessName} onChange={(event) => setBusinessName(event.target.value)} />
          </label>
        )}
        <label className="premium-auth-field">
          <Mail aria-hidden="true" />
          <input aria-label="Email address" autoComplete="email" placeholder="Email Address" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="premium-auth-field">
          <Lock aria-hidden="true" />
          <input aria-label="Password" autoComplete={signingUp ? 'new-password' : 'current-password'} minLength={signingUp ? 12 : 1} maxLength={128} placeholder="Password" required type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} />
          <button className="premium-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
            {showPassword ? <EyeOff /> : <Eye />}
          </button>
        </label>

        {!signingUp && (
          <div className="premium-auth-options">
            <label><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} /> Remember me</label>
            <a href="mailto:mehrab@mehrabdev.com?subject=Delia password reset">Forgot password?</a>
          </div>
        )}

        {signingUp && <p className="premium-password-note">Use at least 12 characters.</p>}
        {error && <p className="premium-auth-error" role="alert">{error}</p>}

        <button className="premium-auth-primary" disabled={loading} type="submit">
          {loading ? 'Please wait…' : signingUp ? 'Create Account' : 'Sign In'}
        </button>
      </form>

      <div className="premium-auth-divider"><span>or</span></div>
      <button className="premium-google" disabled={loading || !googleEnabled} onClick={onGoogle} type="button">
        <GoogleMark />
        <span>{signingUp ? 'Sign up with Google' : 'Continue with Google'}</span>
        <ArrowRight />
      </button>

      <p className="premium-auth-switch">
        {signingUp ? 'Already have an account? ' : "Don't have an account? "}
        <button type="button" onClick={() => switchMode(signingUp ? 'login' : 'signup')}>{signingUp ? 'Sign in' : 'Sign up'}</button>
      </p>
    </section>
  );
}
