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
  ArrowUpRight,
  Bug,
  BookOpen,
  CheckCircle2,
  Clock3,
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

type InsightSection = {
  heading: string;
  copy: string;
};

type BlogInsight = {
  title: string;
  category: string;
  readTime: string;
  excerpt: string;
  body: InsightSection[];
  equation: string;
  mode: StudioMode;
  accent: string;
};

type LandingPageProps = {
  onStart: (example?: LandingExample) => void;
  onAuth: (mode: 'sign-in' | 'sign-up') => void;
  isDeveloper: boolean;
};

const examples: LandingExample[] = [
  { title: 'Polynomial sweep', equation: '0.04 * x^3 - 0.35 * x', mode: 'function', accent: '#ff8b6d' },
  { title: 'Trigonometric wave', equation: 'sin(x + t) * exp(-0.08 * x^2)', mode: 'function', accent: '#c7f36b' },
  { title: 'Polar bloom', equation: '4 * cos(3 * theta)', mode: 'polar', accent: '#d6a8ff' },
  { title: 'Orbiting points', equation: '(0, 0)\n(3*cos(t), 3*sin(t))\n(4*cos(t + 0.8), 4*sin(t + 0.8))', mode: 'points', accent: '#72d8ff' },
  { title: '3D quadric surface', equation: 'x^2 / 4 + y^2 / 9 + z^2 / 16 = 1', mode: 'implicit3d', accent: '#8ce7cf' },
];

const insights: BlogInsight[] = [
  {
    title: 'How Fourier Transforms Make Music Visible',
    category: 'Sound & signals',
    readTime: '8 min read',
    excerpt: 'See how a song becomes a moving landscape of frequencies, harmonics, and rhythm.',
    body: [
      { heading: 'From time to frequency', copy: 'A microphone records amplitude x(t) over time: a one-dimensional trace that tells us what the speaker cone did at each instant. The Fourier transform asks a different question: how much of each pure sinusoid is hidden inside that trace? In its continuous form, X(f) = ∫ x(t)e^(-i2πft) dt. The magnitude |X(f)| is a spectrum, and its peaks are the frequencies carrying the most energy.' },
      { heading: 'Harmonics reveal timbre', copy: 'A steady instrument note usually contains a fundamental frequency f plus harmonics at 2f, 3f, and beyond. The fundamental controls perceived pitch, while the relative strength of the harmonics gives a violin, voice, or square wave its character. A spectrum therefore turns “bright” or “warm” into visible energy distributions. Animate the waveform above a frequency plot to connect the repeating shape in time with the peaks it creates.' },
      { heading: 'The FFT in practice', copy: 'Digital audio is sampled at a fixed rate, so a computer works with a finite block of N samples. The fast Fourier transform (FFT) reduces the direct O(N²) discrete transform to O(N log N) by recursively splitting even and odd samples, then combining them with rotating twiddle factors. A 1,024-sample window at 48 kHz gives bins about 46.9 Hz apart. Larger windows improve frequency resolution but blur short transients.' },
      { heading: 'A useful workflow', copy: 'To build a live visualizer, multiply each audio slice by a Hann window to reduce edge discontinuities, run the FFT, convert magnitudes to decibels, and draw the result with logarithmic frequency spacing. Use the waveform for timing and the spectrum for tone color: kicks concentrate low energy, consonants spread energy upward, and a melody leaves moving harmonic ladders.' },
    ],
    equation: 'sin(x + t) + 0.35 * sin(3*x - t)',
    mode: 'function',
    accent: '#c7f36b',
  },
  {
    title: 'Exploring 3D Quadric Surfaces in Real-Time',
    category: '3D geometry',
    readTime: '10 min read',
    excerpt: 'Rotate spheres, saddles, and hyperboloids while the equation stays in view.',
    body: [
      { heading: 'The general quadric equation', copy: 'A quadric surface is the three-dimensional family described by Ax² + By² + Cz² + Dxy + Exz + Fyz + Gx + Hy + Iz + J = 0. The quadratic terms control curvature, the linear terms shift the surface, and the cross terms rotate its principal axes. Completing the square moves the center; dividing by the remaining constant reveals the canonical form. Reading the signs and denominators is often enough to predict whether the surface closes, opens, or separates before rendering a single triangle.' },
      { heading: 'Ellipsoids: closed in every direction', copy: 'The ellipsoid x²/a² + y²/b² + z²/c² = 1 has positive quadratic terms and a bounded interior. Its intercepts are (±a, 0, 0), (0, ±b, 0), and (0, 0, ±c), so each denominator is a visible semiaxis. A sphere is the special case a = b = c. In an animation, increasing c stretches the same topology vertically; color by z or surface normal to make the changing curvature legible.' },
      { heading: 'Hyperboloids of one and two sheets', copy: 'A hyperboloid of one sheet, x²/a² + y²/b² − z²/c² = 1, stays connected around a narrow waist and opens along the z-axis. A hyperboloid of two sheets, −x²/a² − y²/b² + z²/c² = 1, has two disconnected components because |z| must be at least c. Horizontal slices separate the cases immediately: ellipses that grow from a waist for one sheet, but no points near the origin and two caps for two sheets.' },
      { heading: 'Paraboloids and saddle points', copy: 'An elliptic paraboloid z = x²/a² + y²/b² has elliptical level curves z = constant and rises in every horizontal direction like a bowl. The hyperbolic paraboloid z = x² − y² is different: along y = 0 it becomes z = x², while along x = 0 it becomes z = −y². The origin is therefore a saddle point, not a maximum or minimum; every small neighborhood contains values above and below zero. This is the same local geometry behind a mountain pass.' },
      { heading: 'Rotate, slice, and classify', copy: 'In matrix notation, a quadric is xᵀAx + bᵀx + c = 0. Because A is symmetric after combining cross terms, an orthogonal change of coordinates Q diagonalizes it: QᵀAQ = Λ. The eigenvectors in Q are the principal axes, and the eigenvalues in Λ tell us how sharply the surface bends. Plotting slices such as z = z₀ or x = x₀ turns a 3D classification into a sequence of familiar conics.' },
      { heading: 'Practical application: a geometry lab', copy: 'Change only one coefficient at a time and predict the result before pressing play. Use a wireframe or contour rings to compare cross-sections, rotate slowly to check symmetry, and keep the equation visible beside the surface. This workflow is useful in CAD, computer graphics, optics, and data analysis: a rendered quadric is not decoration, but a compact visual proof of connectivity, scale, and curvature.' },
    ],
    equation: 'x^2 / 4 + y^2 / 9 + z^2 / 16 = 1',
    mode: 'implicit3d',
    accent: '#72d8ff',
  },
  {
    title: 'Polar Roses & Parametric Motion',
    category: 'Curves & motion',
    readTime: '9 min read',
    excerpt: 'Discover why radius and angle can describe patterns that Cartesian graphs hide.',
    body: [
      { heading: 'A coordinate system made for rotation', copy: 'Polar coordinates describe a point with radius r and angle θ. The conversion back to the plane is x = r cos θ and y = r sin θ, while r = √(x² + y²) and θ = atan2(y, x). Instead of solving for y at every x, let r depend on θ and trace the curve in the direction it naturally turns. A negative radius is meaningful: it points along θ + π, which is why some polar curves appear to loop through the origin.' },
      { heading: 'Rose curves and petal symmetry', copy: 'The family r = a cos(kθ) produces rose curves. The amplitude a sets the petal length, and k controls symmetry: an odd k gives k petals over one full turn, while an even k gives 2k petals. For example, r = 4 cos(3θ) produces three petals with maximum radius 4. A phase shift r = a cos(kθ + φ) rotates the pattern by −φ/k, so a slider for φ is a direct visual measurement of angular phase.' },
      { heading: 'Parametric motion has its own clock', copy: 'Parametric curves define x(t) and y(t) independently. Their velocity is v(t) = (x′(t), y′(t)), acceleration is a(t) = (x″(t), y″(t)), and speed is ||v(t)|| = √(x′(t)² + y′(t)²). Equal increments of t do not mean equal distances along the path. A tracer can therefore appear to accelerate even when the geometry is unchanged; show speed next to the plot to separate shape from pacing.' },
      { heading: 'Lissajous figures: two oscillators meet', copy: 'A Lissajous figure uses x(t) = A sin(at + δ) and y(t) = B sin(bt). The ratio a:b determines the number of lobes and crossings, while δ is the phase shift between the oscillators. Rational frequency ratios close into repeating paths; irrational ratios never exactly repeat and slowly fill a region. This is a practical model for comparing audio channels, vibrating beams, and synchronized signals.' },
      { heading: 'Angular velocity and phase shifts', copy: 'If θ(t) is the angular position, then angular velocity is ω(t) = dθ/dt. Constant ω gives uniform rotation; a changing ω creates a swept or eased motion. In r = a cos(kθ + φ), the phase φ changes where a petal points, while in x(t) = A sin(ωt + δ) it shifts the oscillator in time by −δ/ω. These are the same idea expressed in spatial and temporal coordinates.' },
      { heading: 'Practical application: animate the prediction', copy: 'Sample enough θ or t values to keep loops smooth, draw the complete path faintly, then reveal a moving prefix and tracer. Display r, θ, ω, and speed so the controls explain themselves. Change k, φ, and the frequency ratio one at a time; predict the petal count, tilt, or closure first, then use the animation as a visual check.' },
    ],
    equation: '4 * cos(3 * theta)',
    mode: 'polar',
    accent: '#d6a8ff',
  },
  {
    title: 'Vector Fields and Fluid Flow Animations',
    category: 'Fields & motion',
    readTime: '10 min read',
    excerpt: 'Read direction, divergence, and curl as particles travel through a field.',
    body: [
      { heading: 'A vector function at every point', copy: 'A two-dimensional vector field is the function F(x, y) = P(x, y)i + Q(x, y)j, where i and j are the unit directions of the plane. At each location, P controls horizontal motion and Q controls vertical motion. A particle follows dx/dt = P(x, y), dy/dt = Q(x, y). Arrows show the local instruction; trajectories show what happens when that instruction is integrated over time.' },
      { heading: 'Divergence: source and sink analysis', copy: 'The divergence ∇ · F = ∂P/∂x + ∂Q/∂y measures the net outward flow from an infinitesimal box. Positive divergence identifies a source-like region where particles spread, negative divergence identifies a sink where they converge, and zero divergence means local area is preserved even if the field shears. For F(x, y) = (x, y), ∇ · F = 2 everywhere: the field expands uniformly from the origin.' },
      { heading: 'Curl: the rotation field', copy: 'In the plane, curl is the scalar z-component ∇ × F = ∂Q/∂x − ∂P/∂y. Imagine a tiny paddle wheel: positive curl spins it counterclockwise, negative curl spins it clockwise, and zero curl means no local spin. The vortex F(x, y) = (−y, x) has curl 2 but divergence 0, while a radial source can have divergence without local rotation. Keeping those two diagnostics separate prevents a common visual misunderstanding.' },
      { heading: 'Integrating particle trajectories', copy: 'A trajectory solves d r/dt = F(r(t)), with r(t) = (x(t), y(t)). Euler integration advances xₙ₊₁ = xₙ + Δt P(xₙ, yₙ) and yₙ₊₁ = yₙ + Δt Q(xₙ, yₙ). Smaller steps reduce error; Runge–Kutta samples intermediate slopes for better accuracy near curves and vortices. The path is an accumulated record of the field, not another independent equation.' },
      { heading: 'Line integrals connect flow to work', copy: 'For a path C, the line integral ∫C F · dr adds the field component tangent to the path. It measures work done by a force or transport accumulated along a streamline. When F = ∇φ is conservative, the integral depends only on endpoints and every closed-loop integral is zero. Color a trajectory by F · dr to make energy gained and lost visible along the same curve.' },
      { heading: 'Practical application: build a fluid lab', copy: 'Seed particles on a grid or along an inlet, integrate with a stable step, and fade trails instead of redrawing an ever-growing history. Display arrows, divergence, and curl as separate layers; clamp extreme speeds so singularities do not dominate the frame. Try a vortex, a source-sink pair, and a divergence-free field to connect the animation to smoke, weather, incompressible fluids, and flow visualization.' },
    ],
    equation: '[cos(y), sin(x)]',
    mode: 'vector',
    accent: '#72d8ff',
  },
  {
    title: 'Differential Calculus: Derivatives & Integrals',
    category: 'Calculus',
    readTime: '9 min read',
    excerpt: 'Watch a tangent estimate slope while accumulated area builds beneath a curve.',
    body: [
      { heading: 'Newton–Leibniz notation tells two stories', copy: 'Differential calculus uses several notations for the same local idea: f′(x), Dₓf, and dy/dx when y = f(x). Newton’s dot notation, ẏ, emphasizes change with respect to time, while Leibniz’s dy/dx keeps numerator and denominator visible and makes substitution intuitive. A graph becomes more informative when it labels both the point (x, f(x)) and the current slope f′(x).' },
      { heading: 'The instantaneous tangent limit', copy: 'The slope of a secant is Δy/Δx = [f(x + Δx) − f(x)]/Δx. As the second point approaches the first, the instantaneous slope is the limit lim_{Δx → 0} Δy/Δx = f′(x). Animate the secant while shrinking Δx toward zero: the line settles into the tangent, and its angle records the rate of change rather than the curve’s height. At a high flat point, the tangent can still have slope 0.' },
      { heading: 'Product and chain rules', copy: 'When two changing quantities are multiplied, the product rule says (uv)′ = u′v + uv′: each factor gets one turn contributing its change. For a composition f(g(x)), the chain rule says d/dx f(g(x)) = f′(g(x))g′(x), an outer slope multiplied by an inner slope. These rules explain why nested motion, growth, and signal envelopes can change quickly even when each visible component looks simple.' },
      { heading: 'Riemann sums build the integral', copy: 'A definite integral is the limit of signed rectangle sums: ∫ₐᵇ f(x) dx = lim_{n→∞} Σᵢ f(xᵢ*) Δx, with Δx = (b − a)/n. Left, right, and midpoint rules choose different sample heights, but they converge for well-behaved functions as Δx shrinks. Rectangles below the axis contribute negative signed area, which is different from total geometric area; color the two signs differently to make that distinction immediate.' },
      { heading: 'The Fundamental Theorem closes the loop', copy: 'Let A(x) = ∫ₐˣ f(u) du. The Fundamental Theorem of Calculus says A′(x) = f(x): the rate at which accumulated area grows is the current height of the curve. Conversely, if F′ = f, then ∫ₐᵇ f(x) dx = F(b) − F(a). Showing a moving tangent and a growing area together turns the theorem into a visible exchange between local rate and global accumulation.' },
      { heading: 'Practical application: a rate-of-change lab', copy: 'Start with f(x) = x²/4, move the tangent point from left to right, and increase the rectangle count while keeping the curve fixed. Compare f′(x) with a centered finite difference [f(x + h) − f(x − h)]/(2h) and watch the approximation improve as h decreases. Then try a corner or a rapidly oscillating function to see where differentiability and numerical resolution become important in engineering, motion design, and measurement.' },
    ],
    equation: 'x^2 / 4',
    mode: 'function',
    accent: '#ff8b6d',
  },
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

function observeAnimationVisibility(target: HTMLElement, onChange: (visible: boolean) => void) {
  if (typeof IntersectionObserver === 'undefined') return () => undefined;
  const observer = new IntersectionObserver(
    ([entry]) => onChange(Boolean(entry?.isIntersecting)),
    { rootMargin: '160px 0px', threshold: 0.01 },
  );
  observer.observe(target);
  return () => observer.disconnect();
}

function LiveExamplePreview({ example }: { example: LandingExample }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0.5, y: 0.5, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;

    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: true,
      powerPreference: 'high-performance',
    });
    if (gl) {
      const vertexShader = gl.createShader(gl.VERTEX_SHADER);
      const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
      const program = gl.createProgram();
      const buffer = gl.createBuffer();
      if (!vertexShader || !fragmentShader || !program || !buffer) return;
      gl.shaderSource(vertexShader, `
        attribute vec2 a_position;
        uniform float u_point_size;
        void main() {
          gl_Position = vec4(a_position, 0.0, 1.0);
          gl_PointSize = u_point_size;
        }
      `);
      gl.shaderSource(fragmentShader, `
        precision mediump float;
        uniform vec4 u_color;
        void main() { gl_FragColor = u_color; }
      `);
      gl.compileShader(vertexShader);
      gl.compileShader(fragmentShader);
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        return;
      }

      const positionLocation = gl.getAttribLocation(program, 'a_position');
      const colorLocation = gl.getUniformLocation(program, 'u_color');
      const pointSizeLocation = gl.getUniformLocation(program, 'u_point_size');
      const color = example.accent.replace('#', '').match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255) ?? [0.78, 0.95, 0.42];
      const startedAt = performance.now();
      let animationFrame = 0;
      let isVisible = true;
      const resize = () => {
        const bounds = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.max(1, Math.floor(bounds.width * dpr));
        canvas.height = Math.max(1, Math.floor(bounds.height * dpr));
        gl.viewport(0, 0, canvas.width, canvas.height);
      };
      const drawSeries = (points: number[], pointSize = 2.2) => {
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.DYNAMIC_DRAW);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
        gl.uniform1f(pointSizeLocation, pointSize);
        gl.drawArrays(gl.LINE_STRIP, 0, points.length / 2);
      };
      const draw = (now: number) => {
        const time = (now - startedAt) / 1000;
        const pointerShift = pointerRef.current.active ? (pointerRef.current.x - 0.5) * 1.4 : 0;
        gl.clearColor(0.098, 0.149, 0.176, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.uniform4f(colorLocation, color[0], color[1], color[2], 0.96);

        const createSeries = (orbit = 0) => {
          const points: number[] = [];
          for (let index = 0; index <= 240; index += 1) {
            const amount = index / 240;
            const angle = amount * Math.PI * 2;
            let x = Math.cos(angle);
            let y = Math.sin(angle);
            if (example.mode === 'points') {
              const radius = 0.28 + orbit * 0.16;
              const orbitAngle = angle + time * (1.05 + orbit * 0.18) + orbit;
              x = Math.cos(orbitAngle) * radius;
              y = Math.sin(orbitAngle) * radius;
            } else if (example.mode === 'implicit3d') {
              const rotate = time * 0.42;
              const vertical = Math.cos(angle) * (0.52 + orbit * 0.11);
              const depth = Math.sin(angle) * (0.8 - orbit * 0.12);
              x = depth * Math.cos(rotate) - vertical * Math.sin(rotate);
              y = depth * Math.sin(rotate) + vertical * Math.cos(rotate);
            } else if (example.mode === 'polar') {
              const radius = 0.76 + 0.2 * Math.cos(3 * angle + time * 1.7 + pointerShift);
              x = radius * Math.cos(angle);
              y = radius * Math.sin(angle);
            } else {
              const graphX = angle * 2 - Math.PI;
              x = graphX / Math.PI;
              y = example.equation.includes('x^3')
                ? 0.1 * Math.pow(graphX / 2.8, 3) - 0.38 * (graphX / 2.8) + Math.sin(time + pointerShift) * 0.08
                : Math.sin(graphX * 1.25 + time * 1.8 + pointerShift) * 0.62 * Math.exp(-0.035 * graphX * graphX);
            }
            points.push(x * 0.88, y * 0.82);
          }
          return points;
        };

        if (example.mode === 'points' || example.mode === 'implicit3d') {
          const count = example.mode === 'points' ? 3 : 3;
          for (let orbit = 0; orbit < count; orbit += 1) drawSeries(createSeries(orbit), 2.2);
        } else {
          drawSeries(createSeries());
        }
        const tracerSeries = createSeries(example.mode === 'points' ? 1 : 0);
        const tracerIndex = Math.floor(((time * 0.18) % 1) * 240);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tracerSeries), gl.DYNAMIC_DRAW);
        gl.uniform1f(pointSizeLocation, 7);
        gl.drawArrays(gl.POINTS, tracerIndex, 1);
        if (isVisible) animationFrame = window.requestAnimationFrame(draw);
      };

      resize();
      const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
      resizeObserver?.observe(canvas);
      window.addEventListener('resize', resize);
      const stopVisibilityObserver = observeAnimationVisibility(canvas, (visible) => {
        isVisible = visible;
        if (!visible && animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else if (visible && !animationFrame) {
          animationFrame = window.requestAnimationFrame(draw);
        }
      });
      animationFrame = window.requestAnimationFrame(draw);
      return () => {
        window.cancelAnimationFrame(animationFrame);
        stopVisibilityObserver();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', resize);
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
      };
    }

    const context = canvas.getContext('2d');
    if (!context) return;

    let animationFrame = 0;
    let isVisible = true;
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
      } else if (example.mode === 'implicit3d') {
        const rotate = time * 0.45;
        for (let ring = 0; ring < 3; ring += 1) {
          const points: Array<readonly [number, number]> = [];
          for (let step = 0; step <= 120; step += 1) {
            const angle = (step / 120) * Math.PI * 2;
            const vertical = Math.cos(angle) * (0.48 + ring * 0.12);
            const depth = Math.sin(angle) * (0.72 - ring * 0.12);
            const rotatedX = depth * Math.cos(rotate) - vertical * Math.sin(rotate);
            const rotatedY = depth * Math.sin(rotate) + vertical * Math.cos(rotate);
            points.push(project(rotatedX, rotatedY));
          }
          drawPath(points);
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
            y = example.equation.includes('x^3')
              ? (0.09 * Math.pow(graphX / 2.8, 3) - 0.42 * (graphX / 2.8)) + Math.sin(time + pointerShift) * 0.08
              : Math.sin(graphX * 1.25 + time * 1.8 + pointerShift) * 0.62 * Math.exp(-0.035 * graphX * graphX);
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
      if (isVisible) animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    const stopVisibilityObserver = observeAnimationVisibility(canvas, (visible) => {
      isVisible = visible;
      if (!visible && animationFrame) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (visible && !animationFrame) {
        animationFrame = window.requestAnimationFrame(draw);
      }
    });
    animationFrame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      stopVisibilityObserver();
      resizeObserver?.disconnect();
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

function LiveHeroWebGL({ kind, equation, accent }: { kind: 'trigonometric' | 'polar'; equation: string; accent: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return;
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true, powerPreference: 'high-performance' });
    if (!gl) {
      const context = canvas.getContext('2d');
      if (!context) return;
      let frame = 0;
      let isVisible = true;
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
        const centerX = width * 0.5;
        const centerY = height * 0.55;
        const scale = Math.min(width, height) * 0.34;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#09141c';
        context.fillRect(0, 0, width, height);
        context.strokeStyle = 'rgba(238,244,241,.1)';
        context.lineWidth = 1;
        for (let index = 1; index < 5; index += 1) {
          const x = (width * index) / 5;
          context.beginPath();
          context.moveTo(x, 0);
          context.lineTo(x, height);
          context.stroke();
        }
        context.beginPath();
        context.moveTo(0, centerY);
        context.lineTo(width, centerY);
        context.moveTo(centerX, 0);
        context.lineTo(centerX, height);
        context.stroke();
        const points: Array<readonly [number, number]> = [];
        for (let index = 0; index <= 260; index += 1) {
          const amount = index / 260;
          const angle = -Math.PI * 2.2 + amount * Math.PI * 4.4;
          const radius = kind === 'polar' ? 0.19 * 4 * Math.cos(3 * angle + time * 0.8) : 1;
          const x = kind === 'polar' ? radius * Math.cos(angle) : angle / (Math.PI * 2.2);
          const y = kind === 'polar' ? radius * Math.sin(angle) : Math.sin(angle + time * 1.4) * 0.7;
          points.push([centerX + x * scale, centerY - y * scale]);
        }
        context.save();
        context.strokeStyle = accent;
        context.shadowColor = accent;
        context.shadowBlur = 14;
        context.lineWidth = 2.5;
        context.beginPath();
        points.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.stroke();
        const tracerIndex = Math.floor(((time * 0.18) % 1) * (points.length - 1));
        const tracerPoint = points[Math.max(0, Math.min(points.length - 1, tracerIndex))];
        if (tracerPoint) {
          const [tracerX, tracerY] = tracerPoint;
          context.fillStyle = accent;
          context.beginPath();
          context.arc(tracerX, tracerY, 5, 0, Math.PI * 2);
          context.fill();
        }
        context.restore();
        if (isVisible) frame = window.requestAnimationFrame(draw);
      };
      resize();
      const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
      resizeObserver?.observe(canvas);
      window.addEventListener('resize', resize);
      const stopVisibilityObserver = observeAnimationVisibility(canvas, (visible) => {
        isVisible = visible;
        if (!visible && frame) {
          window.cancelAnimationFrame(frame);
          frame = 0;
        } else if (visible && !frame) {
          frame = window.requestAnimationFrame(draw);
        }
      });
      frame = window.requestAnimationFrame(draw);
      return () => {
        window.cancelAnimationFrame(frame);
        stopVisibilityObserver();
        resizeObserver?.disconnect();
        window.removeEventListener('resize', resize);
      };
    }

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;
    gl.shaderSource(vertexShader, `
      attribute vec2 a_position;
      uniform float u_point_size;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        gl_PointSize = u_point_size;
      }
    `);
    gl.shaderSource(fragmentShader, `
      precision mediump float;
      uniform vec4 u_color;
      void main() {
        gl_FragColor = u_color;
      }
    `);
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    const buffer = gl.createBuffer();
    if (!buffer) return;
    const positionLocation = gl.getAttribLocation(program, 'a_position');
    const colorLocation = gl.getUniformLocation(program, 'u_color');
    const pointSizeLocation = gl.getUniformLocation(program, 'u_point_size');
    const color = accent.replace('#', '').match(/.{2}/g)?.map((channel) => parseInt(channel, 16) / 255) ?? [0.78, 0.95, 0.42];
    let frame = 0;
    let isVisible = true;
    const startedAt = performance.now();
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(bounds.width * dpr));
      canvas.height = Math.max(1, Math.floor(bounds.height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    const draw = (now: number) => {
      const time = (now - startedAt) / 1000;
      const points = new Float32Array(241 * 2);
      for (let index = 0; index <= 240; index += 1) {
        const amount = index / 240;
        const angle = -Math.PI * 2.2 + amount * Math.PI * 4.4;
        let x = angle / (Math.PI * 2.2);
        let y: number;
        if (kind === 'polar') {
          const theta = amount * Math.PI * 2;
          const radius = 0.62 + 0.22 * Math.cos(3 * theta + time * 1.7);
          x = radius * Math.cos(theta) * 1.22;
          y = radius * Math.sin(theta) * 1.22;
        } else {
          y = Math.sin(angle + time * 1.4) * 0.7;
          x *= 0.91;
        }
        points[index * 2] = x;
        points[index * 2 + 1] = y;
      }
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, points, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.uniform4f(colorLocation, color[0], color[1], color[2], 0.96);
      gl.uniform1f(pointSizeLocation, 1.5);
      gl.lineWidth(2);
      gl.drawArrays(gl.LINE_STRIP, 0, 241);
      const tracerIndex = kind === 'polar'
        ? Math.floor(((time * 0.18) % 1) * 240)
        : Math.floor(((time * 0.16) % 1) * 240);
      gl.uniform1f(pointSizeLocation, 7);
      gl.drawArrays(gl.POINTS, tracerIndex, 1);
      if (isVisible) frame = window.requestAnimationFrame(draw);
    };
    resize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    const stopVisibilityObserver = observeAnimationVisibility(canvas, (visible) => {
      isVisible = visible;
      if (!visible && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (visible && !frame) {
        frame = window.requestAnimationFrame(draw);
      }
    });
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      stopVisibilityObserver();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
    };
  }, [accent, kind]);

  return (
    <div className="hero-curve-card" style={{ '--hero-curve-accent': accent } as CSSProperties}>
      <div className="hero-curve-heading"><span className="mono">LIVE WEBGL</span><strong>{equation}</strong></div>
      <canvas ref={canvasRef} className="hero-plot hero-plot-canvas" aria-label={`Live WebGL plot of ${equation}`} />
    </div>
  );
}

function LiveHeroPreview() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || typeof window === 'undefined') return;

    let frame = 0;
    let isVisible = true;
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
      const split = width * 0.62;
      const waveCenterY = height * 0.55;
      const waveScaleY = height * 0.27;
      const waveScaleX = split / (Math.PI * 4.4);

      context.clearRect(0, 0, width, height);
      context.strokeStyle = 'rgba(238,244,241,.12)';
      context.lineWidth = 1;
      for (let column = 1; column < 5; column += 1) {
        const x = (split * column) / 5;
        context.beginPath();
        context.moveTo(x, 22);
        context.lineTo(x, height - 20);
        context.stroke();
      }
      context.beginPath();
      context.moveTo(20, waveCenterY);
      context.lineTo(split - 12, waveCenterY);
      context.moveTo(split * 0.5, 22);
      context.lineTo(split * 0.5, height - 20);
      context.stroke();

      context.save();
      context.strokeStyle = '#c7f36b';
      context.shadowColor = '#c7f36b';
      context.shadowBlur = 14;
      context.lineWidth = 2.8;
      context.beginPath();
      for (let index = 0; index <= 220; index += 1) {
        const xValue = -Math.PI * 2.2 + (index / 220) * Math.PI * 4.4;
        const x = split * 0.5 + xValue * waveScaleX;
        const y = waveCenterY - Math.sin(xValue + time * 1.4) * waveScaleY;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      const tracerXValue = ((time * 1.4 + Math.PI * 2.2) % (Math.PI * 4.4)) - Math.PI * 2.2;
      context.fillStyle = '#c7f36b';
      context.beginPath();
      context.arc(
        split * 0.5 + tracerXValue * waveScaleX,
        waveCenterY - Math.sin(tracerXValue + time * 1.4) * waveScaleY,
        5,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

      const polarCenterX = width * 0.81;
      const polarCenterY = height * 0.56;
      const polarScale = Math.min(width * 0.095, height * 0.21);
      context.save();
      context.strokeStyle = '#72d8ff';
      context.shadowColor = '#72d8ff';
      context.shadowBlur = 14;
      context.lineWidth = 2.2;
      context.beginPath();
      for (let index = 0; index <= 260; index += 1) {
        const theta = (index / 260) * Math.PI * 2;
        const radius = 4 * Math.cos(3 * theta);
        const x = polarCenterX + radius * Math.cos(theta) * polarScale;
        const y = polarCenterY - radius * Math.sin(theta) * polarScale;
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.closePath();
      context.stroke();
      const tracerTheta = (time * 1.1) % (Math.PI * 2);
      const tracerRadius = 4 * Math.cos(3 * tracerTheta);
      context.fillStyle = '#72d8ff';
      context.beginPath();
      context.arc(
        polarCenterX + tracerRadius * Math.cos(tracerTheta) * polarScale,
        polarCenterY - tracerRadius * Math.sin(tracerTheta) * polarScale,
        4,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.restore();

      if (isVisible) frame = window.requestAnimationFrame(draw);
    };

    resize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    const stopVisibilityObserver = observeAnimationVisibility(canvas, (visible) => {
      isVisible = visible;
      if (!visible && frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      } else if (visible && !frame) {
        frame = window.requestAnimationFrame(draw);
      }
    });
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      stopVisibilityObserver();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="hero-plot hero-plot-canvas" aria-label="Live plots of y equals sine of x plus t and r equals 4 cosine of 3 theta" />;
}

function LandingBubbleBackground() {
  return (
    <div className="landing-bubble-background" aria-hidden="true">
      <div className="landing-mesh-gradient" />
      <div className="landing-bubble-wash" />
    </div>
  );
}

export function LandingPage({ onStart, onAuth, isDeveloper }: LandingPageProps) {
  const [activeFlow, setActiveFlow] = useState(0);
  const [activeInsight, setActiveInsight] = useState(0);
  const [bugReport, setBugReport] = useState('');
  const [suggestion, setSuggestion] = useState('');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackErrors, setFeedbackErrors] = useState({ name: false, email: false, message: false });
  const [feedbackStatus, setFeedbackStatus] = useState('');
  const insightCarouselRef = useRef<HTMLDivElement>(null);
  const insightDragRef = useRef({ startX: 0, startScrollLeft: 0, dragging: false });
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
    const name = feedbackName.trim();
    const email = feedbackEmail.trim();
    const nextErrors = {
      name: !name,
      email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      message: !trimmed,
    };
    setFeedbackErrors(nextErrors);
    if (nextErrors.name || nextErrors.email || nextErrors.message) {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(100);
      setFeedbackStatus('Please complete the highlighted fields before sending.');
      return;
    }
    setFeedbackStatus('Sending feedback…');
    try {
      const created = await createFeedbackMutation.mutateAsync({
        data: { name, email, category: kind, content: trimmed },
      });
      queryClient.setQueryData(getListFeedbackQueryKey(), (current: typeof feedbackEntries) => [created, ...(current ?? [])]);
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(100);
      setFeedbackStatus('Shared with the community — thank you for helping shape the studio.');
      clear();
      setFeedbackErrors({ name: false, email: false, message: false });
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
          <a href="#insights">Insights</a>
          <a href="#support">Support</a>
        </nav>
        <div className="landing-auth-actions">
          {isDeveloper && <span className="developer-active-tag"><span className="developer-active-dot" /> Developer Active</span>}
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
          <div className="hero-visual" aria-label="Animated mathematical previews">
            <div className="hero-visual-glow" />
            <div className="hero-curve-stack">
              <LiveHeroWebGL kind="trigonometric" equation="y = sin(x + t)" accent="#c7f36b" />
              <LiveHeroWebGL kind="polar" equation="r = 4 cos(3θ)" accent="#72d8ff" />
            </div>
            <div className="hero-frame-label mono">TWO LIVE WEBGL CANVASES · 60 FPS</div>
          </div>
        </section>

        <LandingBubbleBackground />

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

        <section className="landing-section insights-section" id="insights">
          <div className="landing-section-heading">
            <div><span className="landing-eyebrow">Math insights</span><h2>Learn the idea, then make it move.</h2></div>
            <p>Short, visual lessons that turn familiar equations into experiments you can remix.</p>
          </div>
          <div
            className="insight-grid"
            ref={insightCarouselRef}
            onPointerDown={(event) => {
              insightDragRef.current = {
                startX: event.clientX,
                startScrollLeft: insightCarouselRef.current?.scrollLeft ?? 0,
                dragging: true,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.classList.add('is-dragging');
            }}
            onPointerMove={(event) => {
              if (!insightDragRef.current.dragging || !insightCarouselRef.current) return;
              insightCarouselRef.current.scrollLeft = insightDragRef.current.startScrollLeft - (event.clientX - insightDragRef.current.startX);
            }}
            onPointerUp={(event) => {
              insightDragRef.current.dragging = false;
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              event.currentTarget.classList.remove('is-dragging');
            }}
            onPointerCancel={() => { insightDragRef.current.dragging = false; }}
          >
            {insights.map((insight, index) => (
              <article className={`insight-card ${activeInsight === index ? 'active' : ''}`} key={insight.title} style={{ '--insight-accent': insight.accent } as CSSProperties}>
                <button className="insight-select" type="button" onClick={() => setActiveInsight(index)} aria-expanded={activeInsight === index}>
                  <span className="insight-card-top"><BookOpen className="icon" /><span>{insight.category}</span><span className="insight-read-time"><Clock3 className="icon" />{insight.readTime}</span></span>
                  <strong>{insight.title}</strong>
                  <span>{insight.excerpt}</span>
                </button>
                {activeInsight === index && (
                  <div className="insight-expanded">
                    <div className="insight-equation mono">{insight.equation}</div>
                    <div className="insight-reading">
                      {insight.body.map((section) => (
                        <section key={section.heading}>
                          <h3>{section.heading}</h3>
                          <p>{section.copy}</p>
                        </section>
                      ))}
                    </div>
                    <button className="insight-cta" type="button" onClick={() => startStudio(insight)}>
                      Explore in Studio <ArrowUpRight className="icon" />
                    </button>
                  </div>
                )}
              </article>
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
            <div className="feedback-contact-fields">
              <label className="feedback-name-field">
                <span>Your name</span>
                <input className={feedbackErrors.name ? 'has-error' : ''} value={feedbackName} onChange={(event) => { setFeedbackName(event.target.value); setFeedbackErrors((current) => ({ ...current, name: false })); }} placeholder="Name" maxLength={80} aria-invalid={feedbackErrors.name} />
              </label>
              <label className="feedback-email-field">
                <span>Your email</span>
                <input className={feedbackErrors.email ? 'has-error' : ''} type="email" value={feedbackEmail} onChange={(event) => { setFeedbackEmail(event.target.value); setFeedbackErrors((current) => ({ ...current, email: false })); }} placeholder="you@example.com" maxLength={320} aria-invalid={feedbackErrors.email} />
              </label>
            </div>
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('bug', bugReport, () => setBugReport('')); }}>
              <div className="feedback-heading"><Bug className="icon" /><strong>Report a bug</strong></div>
              <textarea className={feedbackErrors.message && !bugReport.trim() ? 'has-error' : ''} value={bugReport} onChange={(event) => { setBugReport(event.target.value); setFeedbackErrors((current) => ({ ...current, message: false })); }} placeholder="What happened? Include the mode and equation if useful." rows={4} aria-invalid={feedbackErrors.message && !bugReport.trim()} />
              <button type="submit" disabled={createFeedbackMutation.isPending}>Save bug report <ArrowRight className="icon" /></button>
            </form>
            <form className="feedback-card" onSubmit={(event) => { event.preventDefault(); void submitFeedback('suggestion', suggestion, () => setSuggestion('')); }}>
              <div className="feedback-heading"><Lightbulb className="icon" /><strong>Future suggestions</strong></div>
              <textarea className={feedbackErrors.message && !suggestion.trim() ? 'has-error' : ''} value={suggestion} onChange={(event) => { setSuggestion(event.target.value); setFeedbackErrors((current) => ({ ...current, message: false })); }} placeholder="What should Second Solution Studio learn next?" rows={4} aria-invalid={feedbackErrors.message && !suggestion.trim()} />
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
