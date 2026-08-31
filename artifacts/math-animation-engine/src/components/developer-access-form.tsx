import { useEffect, useRef, useState, type FormEvent } from 'react';

export const DEVELOPER_EMAIL = 'jhoncena4581@gmail.com';
export const DEVELOPER_PASSWORD = 'developer$000';

type DeveloperAccessFormProps = {
  onUnlock: () => void;
};

export function DeveloperAccessForm({ onUnlock }: DeveloperAccessFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(1);
  const [error, setError] = useState('');
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }
    if (typeof document !== 'undefined') {
      document.body.classList.remove('developer-loading');
    }
  }, []);

  const unlockDeveloperPage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    if (email.trim() !== DEVELOPER_EMAIL || password !== DEVELOPER_PASSWORD) {
      setError('Those developer credentials are not recognized.');
      return;
    }

    setError('');
    setLoading(true);
    setProgress(1);
    document.body.classList.add('developer-loading');

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const welcome = new SpeechSynthesisUtterance('Welcome back Phoenix to developer page');
      welcome.rate = 0.96;
      welcome.pitch = 0.9;
      window.speechSynthesis.speak(welcome);
    }

    const startedAt = performance.now();
    const duration = 4200;
    const animate = (now: number) => {
      const amount = Math.min(1, (now - startedAt) / duration);
      setProgress(Math.max(1, Math.round(amount * 99) + (amount >= 1 ? 1 : 0)));
      if (amount < 1) {
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return;
      }
      try {
        window.localStorage.setItem('second-solution-developer', 'true');
      } catch {
        // The unlocked session still works when storage is unavailable.
      }
      document.body.classList.remove('developer-loading');
      onUnlock();
    };
    animationFrameRef.current = window.requestAnimationFrame(animate);
  };

  if (loading) {
    return (
      <div className="developer-loading-screen" role="status" aria-live="assertive">
        <div className="developer-loading-mark">S²</div>
        <span className="landing-eyebrow">Developer access</span>
        <h3>Preparing your private studio.</h3>
        <div className="developer-loading-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="developer-loading-meta"><span>PHOENIX PROTOCOL</span><strong>{progress}%</strong></div>
        <p>Unlocking the tools reserved for the developer.</p>
      </div>
    );
  }

  return (
    <form className="developer-access" onSubmit={unlockDeveloperPage}>
      <div className="developer-access-heading">
        <span className="landing-eyebrow">Developer access</span>
        <strong>Enter the private studio</strong>
        <small>Use your developer credentials to unlock live copy editing.</small>
      </div>
      <label>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          placeholder="Developer email"
          required
          data-testid="input-developer-email"
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          placeholder="Developer password"
          required
          data-testid="input-developer-password"
        />
      </label>
      {error && <p className="developer-access-error" role="alert">{error}</p>}
      <button className="developer-access-submit" type="submit" data-testid="button-developer-login">Unlock developer page</button>
    </form>
  );
}