import { SignIn, SignUp } from '@clerk/react';
import { X } from 'lucide-react';
import { basePath, clerkAppearance } from '@/lib/clerk-config';

type AuthMode = 'sign-in' | 'sign-up';

type AuthModalProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
};

export function AuthModal({ mode, onModeChange, onClose }: AuthModalProps) {
  return (
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-modal-heading">
          <div>
            <span className="landing-eyebrow">Second Solution Studio account</span>
            <h2 id="auth-modal-title">{mode === 'sign-in' ? 'Welcome back.' : 'Start your next proof.'}</h2>
            <p>Email/password and configured social sign-in are supported.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close authentication dialog"><X className="icon" /></button>
        </div>
        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => onModeChange('sign-in')}>Login</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => onModeChange('sign-up')}>Sign up</button>
        </div>
        <div className="auth-component-wrap">
          {mode === 'sign-in' ? (
            <SignIn
              routing="hash"
              appearance={clerkAppearance}
              signUpUrl={`${basePath}/sign-up`}
              forceRedirectUrl={`${basePath}/studio`}
            />
          ) : (
            <SignUp
              routing="hash"
              appearance={clerkAppearance}
              signInUrl={`${basePath}/sign-in`}
              forceRedirectUrl={`${basePath}/studio`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
