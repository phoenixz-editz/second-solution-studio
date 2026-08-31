import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  getListFeedbackQueryKey,
  useCreateFeedback,
  useListFeedback,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Aperture,
  ArrowRight,
  Bug,
  CheckCircle2,
  Github,
  Instagram,
  Lightbulb,
  Mail,
  MessageCircle,
  Play,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { StudioMode } from '@/hooks/use-equation-validator';

type LandingExample = {
  title: string;
  equation: string;
  mode: StudioMode;
  accent: string;
};

type LandingPageProps = {
  onStart: (example?: LandingExample) => void;
  onAuth: (mode: 'sign-in' | 'sign-up') => void;
};

const examples: LandingExample[] = [
  { title: 'Interference wave', equation: 'sin(x + t) * exp(-0.08 * x^2)', mode: 'function', accent: '#c7f36b' },
  { title: 'Orbiting point set', equation: '(0, 0)\n(3*cos(t), 3*sin(t))\n(4*cos(t + 0.8), 4*sin(t + 0.8))', mode: 'points', accent: '#72d8ff' },
  { title: 'Circle contour', equation: 'x^2 + y^2 = 4', mode: 'implicit', accent: '#ff8b6d' },
  { title: 'Polar bloom', equation: '4 * cos(3 * theta)', mode: 'polar', accent: '#d6a8ff' },
];

const flowSteps = [
  { title: 'Input', copy: 'Type an equation, point set, or field in the language you already use.', icon: '01' },
  { title: 'Local verification', copy: 'A browser-side mathjs validator checks structure, variables, and supported math functions without a round trip.', icon: '02' },
  { title: 'Canvas animation', copy: 'The studio frames the result and turns it into a living, exportable scene.', icon: '03' },
];

type FeedbackKind = 'bug' | 'suggestion';

function formatFeedbackTimestamp(timestamp: string) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'Recently';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function LiveExamplePreview({ example }: { example: LandingExample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || typeof window === 'undefined') return;

    let animationFrame = 0;
    const startedAt = performance.now();
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * dpr));
      canvas.height = Math.max(1, Math.floor(bounds.height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (now: number) => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const time = (now - startedAt) / 1000;
      const pointer = pointerRef.current;
      const pointerShift = pointer.active ? (pointer.x - 0.5) * 1.5 : 0;

      context.clearRect(0, 0, width, height);
      context.fillStyle = '#19262d';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = 'rgba(238,244,241,.1)';
      context.lineWidth = 1;
      for (let column = 1; column < 4; column += 1) {
        const x = (width * column) / 4;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let row = 1; row < 3; row += 1) {
        const y = (height * row) / 3;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }
      context.strokeStyle = 'rgba(238,244,241,.2)';
      context.beginPath();
      context.moveTo(0, height / 2);
      context.lineTo(width, height / 2);
      context.moveTo(width / 2, 0);
      context.lineTo(width / 2, height);
      context.stroke();

      const project = (x: number, y: number) => [
        width / 2 + x * width * 0.26,
        height / 2 - y * height * 0.38,
      ] as const;
      const drawPath = (points: Array<readonly [number, number]>) => {
        if (points.length < 2) return;
        context.beginPath();
        points.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
      };

      context.save();
      context.strokeStyle = example.accent;
      context.shadowColor = example.accent;
      context.shadowBlur = 13;
      context.lineWidth = 2.2;
      if (example.mode === 'points') {
        for (let orbit = 0; orbit < 3; orbit += 1) {
          const points: Array<readonly [number, number]> = [];
          for (let step = 0; step <= 100; step += 1) {
            const angle = (step / 100) * Math.PI * 2 + time * (1.1 + orbit * 0.16) + orbit;
            points.push(project(
              Math.cos(angle) * (0.35 + orbit * 0.17),
              Math.sin(angle) * (0.35 + orbit * 0.17),
            ));
          }
          drawPath(points);
          const angle = time * (1.1 + orbit * 0.16) + orbit;
          const [pointX, pointY] = project(
            Math.cos(angle) * (0.35 + orbit * 0.17),
            Math.sin(angle) * (0.35 + orbit * 0.17),
          );
          context.fillStyle = example.accent;
          context.beginPath();
          context.arc(pointX, pointY, 4 + orbit, 0, Math.PI * 2);
          context.fill();
        }
      } else {
        const points: Array<readonly [number, number]> = [];
        for (let step = 0; step <= 180; step += 1) {
          const amount = step / 180;
          const angle = amount * Math.PI * 2;
          let x = Math.cos(angle);
          let y = Math.sin(angle);
          if (example.mode === 'polar') {
            const radius = 0.72 + 0.22 * Math.cos(3 * angle + time * 1.7 + pointerShift);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
          } else if (example.mode === 'implicit') {
            const radius = 0.82 + 0.035 * Math.sin(4 * angle + time);
            x = radius * Math.cos(angle);
            y = radius * Math.sin(angle);
          } else {
            const graphX = angle * 2 - Math.PI;
            x = graphX / Math.PI;
            y = Math.sin(graphX * 1.25 + time * 1.8 + pointerShift) * 0.62 * Math.exp(-0.035 * graphX * graphX);
          }
          points.push(project(x, y));
        }
        drawPath(points);
      }
      context.restore();

      if (pointer.active) {
        context.strokeStyle = 'rgba(238,244,241,.38)';
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(pointer.x * width - 8, pointer.y * height);
        context.lineTo(pointer.x * width + 8, pointer.y * height);
        context.moveTo(pointer.x * width, pointer.y * height - 8);
        context.lineTo(pointer.x * width, pointer.y * height + 8);
        context.stroke();
      }
      context.fillStyle = 'rgba(238,244,241,.5)';
      context.font = '9px DM Mono, monospace';
      context.fillText(`${example.mode.toUpperCase()} · LIVE`, 14, 18);
      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(canvas);
    window.addEventListener('resize', resize);
    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [example]);

  return (
    <canvas
      ref={canvasRef}
      className="example-preview-canvas"
      aria-hidden="true"
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        pointerRef.current = {
          x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
          y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
          active: true,
        };
      }}
      onPointerLeave={() => { pointerRef.current.active = false; }}
    />
  );
}

export function LandingPage({ onStart, onAuth }: LandingPageProps) {
  const [activeFlow, setActiveFlow] = useState(0);
  const [bugReport, setBugReport] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const queryClient = useQueryClient();
  const feedbackQuery = useListFeedback({
    query: {
      queryKey: getListFeedbackQueryKey(),
      refetchInterval: 5000,
      refetchOnMount: true,
      retry: 2,
      staleTime: 0,
    },
  });
  const createFeedbackMutation = useCreateFeedback({
    mutation: {
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: getListFeedbackQueryKey() });
      },
    },
  });
  const feedbackEntries = Array.isArray(feedbackQuery.data) ? feedbackQuery.data : [];

  const startStudio = (example?: LandingExample) => {
    onStart(example);
  };

  const submitFeedback = async (kind: FeedbackKind, message: string, clear: () => void) => {
    const trimmed = message.trim();
    if (!trimmed) {
      setFeedbackStatus(kind === 'bug' ? 'Describe the issue before sending.' : 'Add an idea before sending.');
      return;
    }
    let name = feedbackName.trim();
    if (!name && typeof window !== 'undefined') {
      try {
        name = window.prompt('What name should appear with your feedback?')?.trim() ?? '';
      } catch {
        name = '';
      }
    }
    if (!name) {
      setFeedbackStatus('Please enter a name before sending feedback.');
      return;
    }
    setFeedbackName(name);
    setFeedbackStatus('Sending feedback…');
    try {
      await createFeedbackMutation.mutateAsync({
        data: { name, category: kind, content: trimmed },
      });
      setFeedbackStatus('Shared with the community — thank you for helping shape the studio.');
      clear();
    } catch {
      setFeedbackStatus('Could not share feedback right now. Please try again or use the contact email.');
    }
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="Second Solution Studio home">
          <span className="landing-brand-mark"><Aperture className="icon" /></span>
          <span>
            <strong>Second Solution Studio</strong>
            <small>Visualize Mathematics Like Never Before.</small>
          </span>
        </a>
        <nav className="landing-nav-links" aria-label="Landing page navigation">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <a href="#examples">Examples</a>
          <a href="#support">Support</a>
        </nav>
        <div className="landing-auth-actions">
          <button className="landing-auth-btn" type="button" onClick={() => onAuth('sign-in')}>Login</button>
          <button className="landing-auth-btn emphasis" type="button" onClick={() => onAuth('sign-up')}>Sign up</button>
          <button className="landing-nav-cta" type="button" onClick={() => startStudio()}>
            Get started <ArrowRight className="icon" />
          </button>
        </div>
        <span className="creator-credit">Made by SOHAIB KHAN</span>
      </header>

      <main>
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="landing-kicker"><Sparkles className="icon" /> An animation studio for mathematical thinking</div>
            <h1>Make the invisible <em>move.</em></h1>
            <p className="landing-intro">
              Turn equations into cinematic, time-aware visualizations. Explore patterns, verify structure,
              and share the moment mathematics becomes intuitive.
            </p>
            <div className="hero-actions">
              <button className="landing-primary-cta" type="button" onClick={() => startStudio()}>
                Enter the studio <ArrowRight className="icon" />
              </button>
              <a className="landing-secondary-cta" href="#examples"><Play className="icon" /> See live examples</a>
            </div>
            <div className="hero-trust-row">
              <span><CheckCircle2 className="icon" /> Local-first sessions</span>
              <span><ShieldCheck className="icon" /> Safe AST validation</span>
              <span><CheckCircle2 className="icon" /> WebGL-enhanced canvas</span>
            </div>
          </div>
          <div className="hero-visual" aria-label="Animated mathematical preview">
            <div className="hero-visual-glow" />
            <div className="hero-equation hero-equation-main">y = sin(x + t)</div>
            <div className="hero-equation hero-equation-secondary">r = 4 cos(3θ)</div>
            <svg className="hero-plot" viewBox="0 0 560 360" role="img" aria-label="Glowing wave plot">
              <defs>
                <linearGradient id="heroWave" x1="0" x2="1">
                  <stop offset="0" stopColor="#c7f36b" stopOpacity=".15" />
                  <stop offset=".5" stopColor="#c7f36b" />
                  <stop offset="1" stopColor="#72d8ff" stopOpacity=".75" />
                </linearGradient>
              </defs>
              <path d="M0 195 C45 90 75 90 120 195 S195 300 240 195 S315 90 360 195 S435 300 480 195 S525 90 560 195" fill="none" stroke="url(#heroWave)" strokeWidth="4" />
              <path d="M0 195H560M280 0V360" stroke="#dfe6e6" strokeOpacity=".15" />
              <circle cx="360" cy="195" r="7" fill="#c7f36b" />
            </svg>
            <div className="hero-frame-label mono">FRAME 148 / 240 · LIVE</div>
          </div>
        </section>

        <section className="landing-section" id="features">
          <div className="landing-section-heading">
            <div><span className="landing-eyebrow">The toolkit</span><h2>Everything you need to see a pattern clearly.</h2></div>
            <p>Purpose-built controls keep the math in focus while the engine handles framing, motion, and recovery.</p>
          </div>
          <div className="feature-grid">
            {[
              ['01', 'Seven graph modes', 'Function, parametric, implicit, polar, vector, piecewise, and dynamic point sets.'],
              ['02', 'Adaptive framing', 'Automatic bounds and smooth camera transitions keep every trace legible.'],
              ['03', 'Layered scenes', 'Compare equations with individual colors, visibility toggles, and synchronized timing.'],
              ['04', 'Export-ready motion', 'Watermarked PNG and WebM capture with filename and frame-rate controls.'],
              ['05', 'Session memory', 'Your active scene, controls, layers, and frame are restored after a reload.'],
              ['06', 'Friendly recovery', 'Clear validator feedback, safe fallbacks, and troubleshooting when a render stalls.'],
            ].map(([number, title, copy]) => (
              <article className="feature-card" key={number}>
                <span className="feature-number mono">{number}</span>
                <h3>{title}</h3>
                <p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-section workflow-section" id="workflow">
          <div className="landing-section-heading">
            <div><span className="landing-eyebrow">Under the hood</span><h2>From a thought to a moving proof.</h2></div>
            <p>Follow the path of every cue through the studio pipeline.</p>
          </div>
          <div className="flowchart">
            {flowSteps.map((step, index) => (
              <div className="flow-step-wrap" key={step.title}>
                <button className={`flow-step ${activeFlow === index ? 'active' : ''}`} type="button" onClick={() => setActiveFlow(index)}>
                  <span className="flow-icon mono">{step.icon}</span>
                  <strong>{step.title}</strong>
                  <span>{step.copy}</span>
                </button>
                {index < flowSteps.length - 1 && <ArrowRight className="flow-arrow icon" aria-hidden="true" />}
              </div>
            ))}
          </div>
          <div className="flow-detail"><span className="landing-eyebrow">Step {String(activeFlow + 1).padStart(2, '0')}</span><strong>{flowSteps[activeFlow].title}</strong><p>{flowSteps[activeFlow].copy}</p></div>
        </section>

        <section className="landing-section examples-section" id="examples">
          <div className="landing-section-heading">
            <div><span className="landing-eyebrow">Start with a spark</span><h2>Interactive examples, ready to remix.</h2></div>
            <p>Choose a scene and open it directly in the canvas, then change every parameter.</p>
          </div>
          <div className="example-grid">
            {examples.map((example) => (
              <button className="example-card" type="button" key={example.title} onClick={() => startStudio(example)} style={{ '--example-accent': example.accent } as CSSProperties}>
                <span className="example-preview"><LiveExamplePreview example={example} /></span>
                <span className="example-card-copy"><strong>{example.title}</strong><span className="mono">{example.equation}</span><small>{example.mode} · Open in studio <ArrowRight className="icon" /></small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="landing-support" id="support">
          <div className="support-copy">
            <span className="landing-eyebrow">Community & support</span>
            <h2>Help make the next equation feel effortless.</h2>
             <p>Found a rough edge or have a mode that deserves a better visual language? Send it our way. Shared notes help every visitor see what the studio is learning.</p>
            <div className="support-links">
              <a href="mailto:jhoncena4581@gmail.com?subject=Second%20Solution%20Studio%20support"><Mail className="icon" /> jhoncena4581@gmail.com</a>
              <a href="https://www.instagram.com/second_solution_math?igsi=MXFlbjg2d3AzZ3Y2eA==" target="_blank" rel="noreferrer"><Instagram className="icon" /> Instagram / second_solution_math</a>
              <a href="https://github.com/" target="_blank" rel="noreferrer"><Github className="icon" /> GitHub community</a>
              <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer"><MessageCircle className="icon" /> Connect with the makers</a>
            </div>
          </div>
          <div className="feedback-grid">
            <label className="feedback-name-field">
              <span>Your name <small>(shown with your feedback)</small></span>
              <input value={feedbackName} onChange={(event) => setFeedbackName(event.target.value)} placeholder="Name" maxLength={80} />
            </label>
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('bug', bugReport, () => setBugReport('')); }}>
              <div className="feedback-heading"><Bug className="icon" /><strong>Report a bug</strong></div>
              <textarea value={bugReport} onChange={(event) => setBugReport(event.target.value)} placeholder="What happened? Include the mode and equation if useful." rows={4} />
              <button type="submit" disabled={createFeedbackMutation.isPending}>Save bug report <ArrowRight className="icon" /></button>
            </form>
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('suggestion', suggestion, () => setSuggestion('')); }}>
              <div className="feedback-heading"><Lightbulb className="icon" /><strong>Future suggestions</strong></div>
              <textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="What should Second Solution Studio learn next?" rows={4} />
              <button type="submit" disabled={createFeedbackMutation.isPending}>Save suggestion <ArrowRight className="icon" /></button>
            </form>
          </div>
          {feedbackStatus && <p className="feedback-status" role="status">{feedbackStatus}</p>}
          <div className="feedback-stream" aria-live="polite">
            <div className="feedback-stream-heading">
              <span className="landing-eyebrow">Community notes</span>
              <span className="mono">{feedbackQuery.isFetching ? 'SYNCING' : `${feedbackEntries.length} SHARED`}</span>
            </div>
            {feedbackEntries.length > 0 ? feedbackEntries.map((entry) => (
              <article className="feedback-entry" key={entry.id}>
                <div className="feedback-entry-meta">
                  <strong>{entry.name}</strong>
                  <span className={`feedback-category ${entry.category}`}>{entry.category === 'bug' ? 'Bug' : 'Suggestion'}</span>
                  <time dateTime={entry.timestamp}>{formatFeedbackTimestamp(entry.timestamp)}</time>
                </div>
                <p>{entry.content}</p>
              </article>
            )) : (
              <p className="feedback-empty">{feedbackQuery.isLoading ? 'Loading community notes…' : 'No community notes yet. Be the first to leave one.'}</p>
            )}
          </div>
        </section>
      </main>

      <footer className="landing-footer"><span>Second Solution Studio</span><span>Visualize Mathematics Like Never Before.</span><span className="mono">MATH / MOTION / MEANING</span></footer>

    </div>
  );
}
