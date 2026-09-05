import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { setStoredAccount } from '@/components/account-menu';

type AuthMode = 'sign-in' | 'sign-up';

type AuthModalProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
};

export function AuthModal({ mode, onModeChange, onClose }: AuthModalProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || password.length < 4) return;
    setStoredAccount({
      username: email.split('@')[0] || 'member',
      email: email.trim().toLowerCase(),
      roleLabel: 'Member',
    });
    onClose();
  };
  return (
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-modal-heading">
          <div>
            <span className="landing-eyebrow">Second Solution Studio account</span>
            <h2 id="auth-modal-title">{mode === 'sign-in' ? 'Welcome back.' : 'Start your next proof.'}</h2>
            <p>Your local studio account is stored only in this browser.</p>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close authentication dialog"><X className="icon" /></button>
        </div>
        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => onModeChange('sign-in')}>Login</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => onModeChange('sign-up')}>Sign up</button>
        </div>
        <div className="auth-component-wrap">
          <form className="local-auth-form" onSubmit={submit}>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className="auth-submit-button" type="submit">{mode === 'sign-in' ? 'Login to studio' : 'Create local account'}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
