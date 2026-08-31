import { useEffect, useRef, useState } from 'react';

export const DEVELOPER_EMAIL = 'jhoncena4581@gmail.com';
export const DEVELOPER_PASSWORD = 'developer$000';

type DeveloperAccessSequenceProps = {
  active: boolean;
  onUnlock: () => void;
};

export function DeveloperAccessSequence({ active, onUnlock }: DeveloperAccessSequenceProps) {
  const [progress, setProgress] = useState(1);
  const animationFrameRef = useRef<number | null>(null);
  const welcomeTriggeredRef = useRef(false);

  useEffect(() => {
    if (!active) return;
    setProgress(1);
    welcomeTriggeredRef.current = false;
    document.body.classList.add('developer-loading');

    const startedAt = performance.now();
    const duration = 4200;
    const animate = (now: number) => {
      const amount = Math.min(1, (now - startedAt) / duration);
      const nextProgress = Math.max(1, Math.round(amount * 99) + (amount >= 1 ? 1 : 0));
      setProgress(nextProgress);
      if (nextProgress >= 95 && !welcomeTriggeredRef.current && 'speechSynthesis' in window) {
        welcomeTriggeredRef.current = true;
        window.speechSynthesis.cancel();
        const welcome = new SpeechSynthesisUtterance('Welcome back Phoenix to developer page');
        welcome.rate = 0.96;
        welcome.pitch = 0.9;
        window.speechSynthesis.speak(welcome);
      }
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

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      document.body.classList.remove('developer-loading');
    };
  }, [active, onUnlock]);

  if (!active) return null;

  return (
    <div className="developer-loading-screen" role="status" aria-live="assertive">
      <div className="developer-loading-backdrop" aria-hidden="true" />
      <div className="developer-loading-card">
        <div className="developer-loading-mark">S²</div>
        <span className="landing-eyebrow">Preparing workspace</span>
        <h3>Opening your studio.</h3>
        <div className="developer-loading-track" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
        <div className="developer-loading-meta"><span>LOADING</span><strong>{progress}%</strong></div>
      </div>
    </div>
  );
}