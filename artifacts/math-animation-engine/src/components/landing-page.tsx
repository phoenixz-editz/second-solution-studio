import { useState, type CSSProperties } from 'react';
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
import { loadEncryptedJson, saveEncryptedJson } from '@/lib/session-storage';

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

type StoredFeedback = { kind: 'bug' | 'suggestion'; message: string; at: number };

export function LandingPage({ onStart, onAuth }: LandingPageProps) {
  const [activeFlow, setActiveFlow] = useState(0);
  const [bugReport, setBugReport] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState('');

  const startStudio = (example?: LandingExample) => {
    onStart(example);
  };

  const submitFeedback = async (kind: StoredFeedback['kind'], message: string, clear: () => void) => {
    const trimmed = message.trim();
    if (!trimmed) {
      setFeedbackStatus(kind === 'bug' ? 'Describe the issue before sending.' : 'Add an idea before sending.');
      return;
    }
    const previous = await loadEncryptedJson<StoredFeedback[]>('second-solution-feedback');
    const next = [{ kind, message: trimmed, at: Date.now() }, ...(previous ?? [])].slice(0, 20);
    const saved = await saveEncryptedJson('second-solution-feedback', next);
    setFeedbackStatus(saved ? 'Saved locally — thank you for helping shape the studio.' : 'Could not save locally. Please use the contact email instead.');
    if (saved) clear();
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
                <span className="example-preview"><span className="example-preview-axis" /><span className="example-preview-line" /></span>
                <span className="example-card-copy"><strong>{example.title}</strong><span className="mono">{example.equation}</span><small>{example.mode} · Open in studio <ArrowRight className="icon" /></small></span>
              </button>
            ))}
          </div>
        </section>

        <section className="landing-support" id="support">
          <div className="support-copy">
            <span className="landing-eyebrow">Community & support</span>
            <h2>Help make the next equation feel effortless.</h2>
            <p>Found a rough edge or have a mode that deserves a better visual language? Send it our way. Notes stay encrypted and local in this prototype.</p>
            <div className="support-links">
              <a href="mailto:jhoncena4581@gmail.com?subject=Second%20Solution%20Studio%20support"><Mail className="icon" /> jhoncena4581@gmail.com</a>
              <a href="https://www.instagram.com/second_solution_math?igsi=MXFlbjg2d3AzZ3Y2eA==" target="_blank" rel="noreferrer"><Instagram className="icon" /> Instagram / second_solution_math</a>
              <a href="https://github.com/" target="_blank" rel="noreferrer"><Github className="icon" /> GitHub community</a>
              <a href="https://www.linkedin.com/" target="_blank" rel="noreferrer"><MessageCircle className="icon" /> Connect with the makers</a>
            </div>
          </div>
          <div className="feedback-grid">
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('bug', bugReport, () => setBugReport('')); }}>
              <div className="feedback-heading"><Bug className="icon" /><strong>Report a bug</strong></div>
              <textarea value={bugReport} onChange={(event) => setBugReport(event.target.value)} placeholder="What happened? Include the mode and equation if useful." rows={4} />
              <button type="submit">Save bug report <ArrowRight className="icon" /></button>
            </form>
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('suggestion', suggestion, () => setSuggestion('')); }}>
              <div className="feedback-heading"><Lightbulb className="icon" /><strong>Future suggestions</strong></div>
              <textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} placeholder="What should Second Solution Studio learn next?" rows={4} />
              <button type="submit">Save suggestion <ArrowRight className="icon" /></button>
            </form>
          </div>
          {feedbackStatus && <p className="feedback-status" role="status">{feedbackStatus}</p>}
        </section>
      </main>

      <footer className="landing-footer"><span>Second Solution Studio</span><span>Visualize Mathematics Like Never Before.</span><span className="mono">MATH / MOTION / MEANING</span></footer>

    </div>
  );
}
