import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  Activity,
  Aperture,
  ArrowDownToLine,
  CircleHelp,
  Download,
  Gauge,
  Minus,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  Eye,
  EyeOff,
  Palette,
  RotateCcw,
  Redo2,
  Settings2,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  Waves,
  X,
} from 'lucide-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClerkProvider, SignIn, SignUp } from '@clerk/react';
import { ErrorBoundary } from '@/components/error-boundary';
import { LandingPage } from '@/components/landing-page';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Router as WouterRouter, Switch, useLocation } from 'wouter';
import { useEquationValidator, type StudioMode } from '@/hooks/use-equation-validator';
import { basePath, clerkAppearance, clerkProxyUrl, clerkPubKey } from '@/lib/clerk-config';
import {
  buildGraphEvaluator as parserBuildGraphEvaluator,
  evaluatePointSet,
  normalizeForPreview as parserNormalizeForPreview,
  splitEquationExpressions as parserSplitEquationExpressions,
  detectSmartMode,
  type ResolvedStudioMode,
  type CompiledExpression,
  type GraphEvaluator,
  type GraphPoint,
} from '@/lib/math-parser';
import { clearStoredSession, loadEncryptedJson, saveEncryptedJson } from '@/lib/session-storage';

const queryClient = new QueryClient();
type ScreenPoint = [number, number];
type ContourSegment = { start: ScreenPoint; end: ScreenPoint };
type ContourPolyline = ScreenPoint[];
type GraphRange = { xMin: number; xMax: number; tMin: number; tMax: number };
type CachedVectorArrow = { x: number; y: number; endX: number; endY: number };
type WorldContourPolyline = ScreenPoint[];
type CachedFrame = {
  progress: number;
  phase: number;
  line: GraphPoint[];
  trailOne: GraphPoint[];
  trailTwo: GraphPoint[];
  points: GraphPoint[];
  vector: CachedVectorArrow[];
  contour: WorldContourPolyline[];
};

const IMPLICIT_GRID_RESOLUTION = 96;
const IMPLICIT_CACHE_LIMIT = 24;
const FRAME_CACHE_SIZE = 60;
const IMPLICIT_WORLD_EXTENT = 10;
const IMPLICIT_3D_DRAFT_GRID_RESOLUTION = 24;
const IMPLICIT_3D_FINAL_GRID_RESOLUTION = 64;
const IMPLICIT_3D_WORLD_EXTENT = 3.4;
const BRAND_WATERMARK = 'Second Solution Studio';
const AUDIO_MIN_HZ = 200;
const AUDIO_MAX_HZ = 1200;
type ImplicitSurfaceWorkerResult = {
  type: 'result';
  id: number;
  positions: ArrayBuffer;
  indices: ArrayBuffer;
};
type ImplicitSurfaceWorkerError = {
  type: 'error';
  id: number;
  message: string;
};
type ImplicitSurfaceWorkerRequest = {
  type: 'generate';
  id: number;
  equation: string;
  phase: number;
  speed: number;
  resolution: number;
  extent: number;
};

type AudioEngine = {
  context: AudioContext;
  master: GainNode;
  destination: MediaStreamAudioDestinationNode;
};

function getAudioContextConstructor() {
  return window.AudioContext
    ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function scheduleAudioTone(engine: AudioEngine, frequency: number, duration = 0.085, volume = 0.12) {
  const now = engine.context.currentTime;
  const oscillator = engine.context.createOscillator();
  const envelope = engine.context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(Math.max(AUDIO_MIN_HZ, Math.min(AUDIO_MAX_HZ, frequency)), now);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(envelope);
  envelope.connect(engine.master);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

function scheduleAudioBeat(engine: AudioEngine, strength = 1) {
  const now = engine.context.currentTime;
  const oscillator = engine.context.createOscillator();
  const envelope = engine.context.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(135, now);
  oscillator.frequency.exponentialRampToValueAtTime(55, now + 0.12);
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(0.22 * strength, now + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  oscillator.connect(envelope);
  envelope.connect(engine.master);
  oscillator.start(now);
  oscillator.stop(now + 0.16);
}

function canvasHasNonEmptyPixels(canvas: HTMLCanvasElement) {
  try {
    const context2d = canvas.getContext('2d');
    if (context2d) {
      const width = Math.max(1, Math.min(canvas.width, 320));
      const height = Math.max(1, Math.min(canvas.height, 180));
      const pixels = context2d.getImageData(0, 0, width, height).data;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] > 0 && (pixels[index] > 42 || pixels[index + 1] > 42 || pixels[index + 2] > 42)) {
          return true;
        }
      }
      return false;
    }
    const webgl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!webgl) return false;
    const pixel = new Uint8Array(4);
    const samplePoints: Array<[number, number]> = [];
    for (let row = 0; row < 5; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        samplePoints.push([
          Math.floor((column / 4) * Math.max(0, canvas.width - 1)),
          Math.floor((row / 4) * Math.max(0, canvas.height - 1)),
        ]);
      }
    }
    return samplePoints.some(([x, y]) => {
      webgl.readPixels(x, y, 1, 1, webgl.RGBA, webgl.UNSIGNED_BYTE, pixel);
      return pixel[3] > 0 && (pixel[0] > 42 || pixel[1] > 42 || pixel[2] > 42);
    });
  } catch {
    return false;
  }
}

function easeInOutCubic(value: number) {
  const progress = Math.max(0, Math.min(1, value));
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function detectSmartRange(equation: string, mode: StudioMode): GraphRange {
  const input = normalizeForPreview(equation).toLowerCase();
  if (mode === 'parametric') {
    const isSpiral = /(?:^|[,(]\s*)t\s*\*\s*(?:sin|cos)|(?:sin|cos)\s*\(\s*t\s*\)\s*\*\s*t/.test(input);
    return { xMin: -10, xMax: 10, tMin: 0, tMax: isSpiral ? 10 : 2 * Math.PI };
  }
  if (mode === 'polar') return { xMin: -6, xMax: 6, tMin: 0, tMax: 2 * Math.PI };
  return { xMin: -10, xMax: 10, tMin: 0, tMax: 2 * Math.PI };
}

function contourPointKey(point: ScreenPoint) {
  return `${Math.round(point[0] * 1000)}:${Math.round(point[1] * 1000)}`;
}

function stitchContourSegments(segments: ContourSegment[]): ContourPolyline[] {
  const endpointMap = new Map<string, Array<{ index: number; endpoint: 0 | 1 }>>();
  segments.forEach((segment, index) => {
    for (const [endpoint, point] of [[0, segment.start], [1, segment.end]] as const) {
      const key = contourPointKey(point);
      const references = endpointMap.get(key) ?? [];
      references.push({ index, endpoint });
      endpointMap.set(key, references);
    }
  });

  const used = new Uint8Array(segments.length);
  const polylines: ContourPolyline[] = [];
  const extend = (polyline: ContourPolyline, fromStart: boolean) => {
    let current = fromStart ? polyline[0] : polyline[polyline.length - 1];
    while (current) {
      const nextReference = endpointMap.get(contourPointKey(current))
        ?.find((reference) => used[reference.index] === 0);
      if (!nextReference) break;
      used[nextReference.index] = 1;
      const segment = segments[nextReference.index];
      const nextPoint = nextReference.endpoint === 0 ? segment.end : segment.start;
      if (fromStart) polyline.unshift(nextPoint);
      else polyline.push(nextPoint);
      current = nextPoint;
    }
  };

  segments.forEach((segment, index) => {
    if (used[index]) return;
    used[index] = 1;
    const polyline: ContourPolyline = [segment.start, segment.end];
    extend(polyline, false);
    extend(polyline, true);
    polylines.push(polyline);
  });
  return polylines;
}

function createImplicitSurfaceGeometry(
  expression: CompiledExpression,
  phase: number,
  speed: number,
  resolution: number,
) {
  const extent = IMPLICIT_3D_WORLD_EXTENT;
  const size = resolution + 1;
  const values = new Float32Array(size * size * size);
  const indexOf = (x: number, y: number, z: number) => (z * size + y) * size + x;
  const evaluate = (x: number, y: number, z: number) => {
    try {
      const value = Number(expression.evaluate({ x, y, z, t: phase, a: phase, b: speed }));
      return Number.isFinite(value) ? value : Number.NaN;
    } catch {
      return Number.NaN;
    }
  };
  const step = (extent * 2) / resolution;
  for (let z = 0; z <= resolution; z += 1) {
    for (let y = 0; y <= resolution; y += 1) {
      for (let x = 0; x <= resolution; x += 1) {
        values[indexOf(x, y, z)] = evaluate(
          -extent + x * step,
          -extent + y * step,
          -extent + z * step,
        );
      }
    }
  }

  const positions: number[] = [];
  const tetrahedra = [
    [0, 5, 1, 6],
    [0, 1, 2, 6],
    [0, 2, 3, 6],
    [0, 3, 7, 6],
    [0, 7, 4, 6],
    [0, 4, 5, 6],
  ] as const;
  const tetraEdges = [
    [0, 1], [1, 2], [2, 3], [3, 0], [0, 2], [1, 3],
  ] as const;
  const cubeCorners = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ] as const;

  for (let z = 0; z < resolution; z += 1) {
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const corners = cubeCorners.map(([dx, dy, dz]) => {
          const px = -extent + (x + dx) * step;
          const py = -extent + (y + dy) * step;
          const pz = -extent + (z + dz) * step;
          return {
            point: [px, py, pz] as [number, number, number],
            value: values[indexOf(x + dx, y + dy, z + dz)],
          };
        });
        tetrahedra.forEach((tetrahedron) => {
          const intersections: [number, number, number][] = [];
          tetraEdges.forEach(([firstIndex, secondIndex]) => {
            const first = corners[tetrahedron[firstIndex]];
            const second = corners[tetrahedron[secondIndex]];
            if (!Number.isFinite(first.value) || !Number.isFinite(second.value)) return;
            if ((first.value < 0) === (second.value < 0)) return;
            const denominator = first.value - second.value;
            const amount = Math.max(0, Math.min(1, Math.abs(denominator) < 1e-12 ? 0.5 : first.value / denominator));
            intersections.push([
              first.point[0] + (second.point[0] - first.point[0]) * amount,
              first.point[1] + (second.point[1] - first.point[1]) * amount,
              first.point[2] + (second.point[2] - first.point[2]) * amount,
            ]);
          });
          if (intersections.length < 3) return;
          const appendTriangle = (triangle: [number, number, number]) => {
            triangle.forEach((pointIndex) => positions.push(...intersections[pointIndex]));
          };
          appendTriangle([0, 1, 2]);
          if (intersections.length >= 4) appendTriangle([0, 2, 3]);
        });
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (positions.length === 0) return geometry;

  // The tetrahedra pass deliberately emits independent triangles. Weld their
  // shared edge vertices before calculating normals so Phong-style lighting
  // can interpolate continuously across the extracted surface.
  const smoothedGeometry = mergeVertices(geometry, Math.max(step * 0.08, 1e-5));
  geometry.dispose();
  smoothedGeometry.computeVertexNormals();
  smoothedGeometry.computeBoundingSphere();
  return smoothedGeometry;
}

function splitEquationExpressions(input: string, mode: StudioMode) {
  return parserSplitEquationExpressions(input, mode);
  /*
  const stripped = stripOuterCollections(normalizeForPreview(input));
  if (!stripped) return [];
  if (mode === 'points') return [stripped];

  if (mode === 'parametric') {
    if (/[;\n]/.test(stripped)) {
      return splitTopLevelExpressions(stripped, new Set([';', '\n'])).flatMap((part) =>
        part.trim().startsWith('(') ? splitTopLevelExpressions(part, new Set([','])) : [part],
      );
    }
    if (/^\s*x\s*\(\s*t\s*\)\s*=/.test(stripped) || !stripped.trim().startsWith('(')) {
      return [stripped];
    }
    const grouped = splitTopLevelExpressions(stripped, new Set([',']));
    return grouped.length > 1 ? grouped : [stripped];
  }

  return splitTopLevelExpressions(stripped, new Set([',', ';', '\n']));
  */
}

function normalizeForPreview(input: string) {
  return parserNormalizeForPreview(input);
}

/*
function parseManualPoints(input: string) {
  return splitTopLevelExpressions(input, new Set([',', ';', '\n'])).flatMap((line): GraphPoint[] => {
    const match = line.trim().match(/^\(\s*(-?(?:\d+\.?\d*|\.\d+))\s*,\s*(-?(?:\d+\.?\d*|\.\d+))\s*\)$/);
    return match ? [{ x: Number(match[1]), y: Number(match[2]) }] : [];
  });
}

function buildGraphEvaluator(equation: string, mode: StudioMode): GraphEvaluator {
  const input = normalizeForPreview(equation);
  try {
    if (mode === 'points') {
      const points = parseManualPoints(input);
      return points.length >= 2 ? { kind: 'points', points } : null;
    }
    if (mode === 'parametric') {
      const parts = splitParametric(input);
      if (!parts) return null;
      return { kind: 'parametric', x: math.compile(parts[0]), y: math.compile(parts[1]) };
    }
    if (mode === 'vector') {
      const parts = splitParametric(input);
      if (!parts) return null;
      return { kind: 'vector', x: math.compile(parts[0]), y: math.compile(parts[1]) };
    }
    if (mode === 'implicit' && evaluator?.kind === 'implicit') {
      const equality = input.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
      if (!equality) return null;
      return { kind: 'implicit', expression: math.compile(`(${equality[1]}) - (${equality[2]})`) };
    }
    if (mode === 'polar') {
      const expression = input.match(/^\s*r\s*=\s*(.+)$/i)?.[1] ?? input;
      return { kind: 'polar', expression: math.compile(expression) };
    }
    const expression = input.match(/^\s*y\s*=\s*(.+)$/i)?.[1] ?? input;
    return { kind: 'function', expression: math.compile(expression) };
  } catch {
    return null;
  }
}
*/

function buildGraphEvaluator(equation: string, mode: StudioMode): GraphEvaluator {
  return parserBuildGraphEvaluator(equation, mode);
}

type HistoryItem = { equation: string; mode: ResolvedStudioMode; at: number; preview?: string };
type EquationLayer = { id: number; equation: string; mode: ResolvedStudioMode; color: string; visible: boolean };
type StudioTheme = 'light' | 'dark' | 'neon';
type StudioSessionState = {
  equation: string;
  mode: StudioMode;
  layers: EquationLayer[];
  activeLayerId: number;
  theme: StudioTheme;
  playing: boolean;
  progress: number;
  autoRange: boolean;
  manualXMin: number;
  manualXMax: number;
  manualTMin: number;
  manualTMax: number;
  speed: number;
  duration: number;
  lineWidth: number;
  color: string;
  showGrid: boolean;
  gridDensity: number;
  showAxes: boolean;
  showTrail: boolean;
  pointStyle: 'line' | 'particles';
  originView: boolean;
  showFps: boolean;
  showWatermark: boolean;
  watermark: string;
  filename: string;
  fps: number;
  pageZoom: number;
  graphZoom: number;
  history: HistoryItem[];
};

const SESSION_STORAGE_KEY = 'second-solution-studio-session-v1';
const DEFAULT_EQUATION = 'sin(x + t) * exp(-0.08 * x^2)';

function isStudioMode(value: unknown): value is StudioMode {
  return ['auto', 'function', 'parametric', 'implicit', 'implicit3d', 'polar', 'vector', 'piecewise', 'points'].includes(String(value));
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampPageZoom(value: number) {
  return Math.min(2, Math.max(0.9, Number(value.toFixed(2))));
}

const layerColors = ['#c7f36b', '#ff8b6d', '#72d8ff', '#d6a8ff', '#ffd166'];
const multiGraphColors = ['#A8FF00', '#00E5FF', '#FF007F'];

function smartPatternLabel(equation: string, mode: StudioMode) {
  const input = normalizeForPreview(equation).toLowerCase();
  if (mode === 'parametric') return /t\s*\*\s*(?:sin|cos)|(?:sin|cos)\s*\(\s*t\s*\)\s*\*\s*t/.test(input) ? 'Spiral' : 'Parametric pattern';
  if (mode === 'polar') return 'Polar field';
  if (mode === 'vector') return 'Direction field';
  if (mode === 'piecewise') return 'Piecewise function';
  if (/\b(?:sin|cos|tan)\b/.test(input)) return 'Wave';
  if (/\^|\b(?:poly|x\s*\*)/.test(input)) return 'Polynomial';
  return mode === 'implicit' || mode === 'implicit3d' ? 'Contour' : mode === 'points' ? 'Point trail' : 'Function';
}

function makeHistoryPreview(equation: string, mode: StudioMode, color = '#c7f36b') {
  const seed = equation.length + mode.length;
  const points = Array.from({ length: 12 }, (_, index) => {
    const x = 4 + index * 7.5;
    const y = 16 + Math.sin(index * 0.8 + seed) * 8 + Math.cos(index * 0.31) * 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="54" viewBox="0 0 96 54"><rect width="96" height="54" fill="#242936"/><path d="M0 27H96M48 0V54" stroke="#5b6270" stroke-width=".5" opacity=".42"/><polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function filenameFromEquation(equation: string) {
  const normalized = normalizeForPreview(equation)
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]+/gi, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return normalized ? `second-solution-${normalized.slice(0, 54)}` : 'second-solution-scene';
}

const presets: Array<{ equation: string; label: string; mode: StudioMode; symbol: string }> = [
  { equation: 'sin(x) * cos(t)', label: 'Interference', mode: 'function', symbol: '∿' },
  { equation: 'x^2 / 8 - 2', label: 'Parabola', mode: 'function', symbol: '⌒' },
  { equation: 'cos(t), sin(2*t)', label: 'Klein wave', mode: 'parametric', symbol: '◌' },
  { equation: 'x^2 + y^2 = 4', label: 'Circle field', mode: 'implicit', symbol: '◎' },
  { equation: '4 * cos(3 * theta)', label: 'Polar bloom', mode: 'polar', symbol: '✳' },
  { equation: '(-y, x)', label: 'Orbit field', mode: 'vector', symbol: '↗' },
  { equation: 'x < 0 ? sin(x) : cos(x)', label: 'Split wave', mode: 'piecewise', symbol: '⌁' },
  { equation: '(1, 1)\n(2, 4)\n(3, 9)\n(4, 16)', label: 'Point trail', mode: 'points', symbol: '⋮' },
];

const modeDetails: Record<StudioMode, { title: string; helper: string; placeholder: string }> = {
  auto: { title: 'Auto / Smart', helper: 'detect from variables', placeholder: 'Try any equation, curve, field, or point set' },
  function: { title: 'Function', helper: 'y = f(x, t)', placeholder: 'sin(x + t) / (1 + 0.2x²)' },
  parametric: { title: 'Parametric', helper: 'x(t), y(t)', placeholder: 'cos(t), sin(t)' },
  implicit: { title: 'Implicit', helper: 'F(x, y) = 0', placeholder: 'x² + y² = 4' },
  implicit3d: { title: '3D Implicit', helper: 'F(x, y, z) = 0', placeholder: 'x² + y² + z² = 4' },
  polar: { title: 'Polar', helper: 'r = f(θ, t)', placeholder: '4 * cos(3 * theta)' },
  vector: { title: 'Vector field', helper: '(u, v)', placeholder: '(-y, x)' },
  piecewise: { title: 'Piecewise', helper: 'conditional f(x)', placeholder: 'x < 0 ? sin(x) : cos(x)' },
  points: { title: 'Points', helper: '(x, y) pairs', placeholder: '(1, 2)\n(2, 4)\n(3, 9)' },
};

function AppIcon({ className = 'icon' }: { className?: string }) {
  return <Aperture className={className} />;
}

function GraphCanvas({
  equation,
  mode,
  range,
  playing,
  progress,
  speed,
  showGrid,
  gridDensity,
  showAxes,
  showTrail,
  lineWidth,
  color,
  pointStyle,
  graphZoom,
  originView,
  cameraFrame,
  cameraSource,
  animationExpected,
  onRenderStart,
  onRenderStatus,
  onRuntimeWarning,
}: {
  equation: string;
  mode: StudioMode;
  range: GraphRange;
  playing: boolean;
  progress: number;
  speed: number;
  showGrid: boolean;
  gridDensity: number;
  showAxes: boolean;
  showTrail: boolean;
  lineWidth: number;
  color: string;
  pointStyle: 'line' | 'particles';
  graphZoom: number;
  originView: boolean;
  cameraFrame: { scale: number; centerX: number; centerY: number };
  cameraSource: boolean;
  animationExpected: boolean;
  onRenderStart: () => void;
  onRenderStatus: (status: 'ready' | 'error', message?: string) => void;
  onRuntimeWarning: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement>(null);
  const threeSceneRef = useRef<THREE.Scene | null>(null);
  const implicitContourCacheRef = useRef(new Map<string, ContourPolyline[]>());
  const runtimeWarningRef = useRef(false);
  const renderHealthFramesRef = useRef(0);
  const pixelVerificationFramesRef = useRef(0);
  const healthReportedRef = useRef(false);
  const frameCacheRef = useRef(new Map<number, CachedFrame>());
  const frameCacheBuildRef = useRef(0);
  const threeSurfaceGroupRef = useRef<THREE.Group | null>(null);
  const threeSurfaceGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const threeSurfaceReadyRef = useRef(false);
  const lastSurfaceBuildRef = useRef(0);
  const surfaceWorkerRef = useRef<Worker | null>(null);
  const surfaceRequestIdRef = useRef(0);
  const surfaceQueueTokenRef = useRef(0);
  const surfaceRequestRef = useRef<ImplicitSurfaceWorkerRequest | null>(null);
  const surfaceRequestTimerRef = useRef<number | null>(null);
  const surfaceFallbackTimerRef = useRef<number | null>(null);
  const surfaceWorkerBusyRef = useRef(false);
  const surfaceInputKeyRef = useRef('');
  const surfaceColorRef = useRef(color);
  const installSurfaceRef = useRef<(positions: ArrayBufferLike, indices?: ArrayBufferLike) => void>(() => undefined);
  const drawRef = useRef<() => void>(() => undefined);
  const [surfaceQuality, setSurfaceQuality] = useState<'draft' | 'final'>('final');
  const evaluator = useMemo(() => buildGraphEvaluator(equation, mode), [equation, mode]);
  const viewportRangeRef = useRef(range);
  const [viewportRange, setViewportRange] = useState(range);

  useEffect(() => {
    surfaceColorRef.current = color;
  }, [color]);

  const createFrameBuffer = useCallback((frameIndex: number): CachedFrame => {
    const frameProgress = frameIndex / Math.max(1, FRAME_CACHE_SIZE - 1);
    const phase = frameProgress * Math.PI * 2 * speed;
    const line: GraphPoint[] = [];
    const trailOne: GraphPoint[] = [];
    const trailTwo: GraphPoint[] = [];
    const points = evaluator?.kind === 'points'
      ? evaluatePointSet(evaluator.points, phase, speed)
      : [];
    const vector: CachedVectorArrow[] = [];
    const contour: WorldContourPolyline[] = [];

    const evaluateExpression = (expression: CompiledExpression, scope: Record<string, number>) => {
      try {
        const value = Number(expression.evaluate(scope));
        return Number.isFinite(value) ? value : Number.NaN;
      } catch {
        return Number.NaN;
      }
    };
    const sampleLine = (currentPhase: number) => {
      if (!evaluator || evaluator.kind === 'points' || evaluator.kind === 'vector' || evaluator.kind === 'implicit') return [];
      const sampleCount = evaluator.kind === 'function' ? 1000 : evaluator.kind === 'polar' ? 900 : 650;
      const sampled: GraphPoint[] = [];
      for (let index = 0; index <= sampleCount; index += 1) {
        const amount = index / sampleCount;
        let x = Number.NaN;
        let y = Number.NaN;
        if (evaluator.kind === 'function') {
          x = range.xMin + amount * (range.xMax - range.xMin);
          y = evaluateExpression(evaluator.expression, { x, t: currentPhase, a: currentPhase, b: speed, z: 0 });
        } else if (evaluator.kind === 'parametric') {
          const parameter = range.tMin + amount * (range.tMax - range.tMin);
          x = evaluateExpression(evaluator.x, { t: parameter, a: currentPhase, b: speed, z: 0 });
          y = evaluateExpression(evaluator.y, { t: parameter, a: currentPhase, b: speed, z: 0 });
        } else if (evaluator.kind === 'polar') {
          const theta = range.tMin + amount * (range.tMax - range.tMin);
          const radius = evaluateExpression(evaluator.expression, { theta, t: currentPhase, a: currentPhase, b: speed, z: 0 });
          x = radius * Math.cos(theta);
          y = radius * Math.sin(theta);
        }
        if (Number.isFinite(x) && Number.isFinite(y) && Math.abs(x) < 100 && Math.abs(y) < 100) {
          sampled.push({ x, y });
        } else {
          sampled.push({ x: Number.NaN, y: Number.NaN });
        }
      }
      return sampled;
    };

    if (evaluator?.kind === 'function' || evaluator?.kind === 'parametric' || evaluator?.kind === 'polar') {
      line.push(...sampleLine(phase));
      trailOne.push(...sampleLine(phase - 0.38));
      trailTwo.push(...sampleLine(phase - 0.18));
    }

    if (evaluator?.kind === 'vector') {
      const density = 8;
      const extent = 4.5;
      for (let row = -density; row <= density; row += 1) {
        for (let column = -density; column <= density; column += 1) {
          const x = (column / density) * extent;
          const y = (row / density) * extent;
          const vx = evaluateExpression(evaluator.x, { x, y, t: phase, a: phase, b: speed, z: 0 });
          const vy = evaluateExpression(evaluator.y, { x, y, t: phase, a: phase, b: speed, z: 0 });
          const magnitude = Math.hypot(vx, vy);
          if (!Number.isFinite(magnitude) || magnitude < 1e-6) continue;
          const length = Math.min(0.65, Math.max(0.18, magnitude * 0.16));
          vector.push({ x, y, endX: x + (vx / magnitude) * length, endY: y + (vy / magnitude) * length });
        }
      }
    }

    if (evaluator?.kind === 'implicit') {
      const resolution = IMPLICIT_GRID_RESOLUTION;
      const values = new Float32Array((resolution + 1) * (resolution + 1));
      const step = (IMPLICIT_WORLD_EXTENT * 2) / resolution;
      for (let row = 0; row <= resolution; row += 1) {
        const y = IMPLICIT_WORLD_EXTENT - row * step;
        const rowOffset = row * (resolution + 1);
        for (let column = 0; column <= resolution; column += 1) {
          const x = -IMPLICIT_WORLD_EXTENT + column * step;
          values[rowOffset + column] = evaluateExpression(evaluator.expression, {
            x,
            y,
            t: phase,
            a: phase,
            b: speed,
            z: 0,
          });
        }
      }

      const segments: ContourSegment[] = [];
      const interpolate = (
        first: ScreenPoint,
        second: ScreenPoint,
        firstValue: number,
        secondValue: number,
      ): ScreenPoint => {
        const denominator = firstValue - secondValue;
        const amount = Math.abs(denominator) < 1e-12
          ? 0.5
          : Math.max(0, Math.min(1, firstValue / denominator));
        return [
          first[0] + (second[0] - first[0]) * amount,
          first[1] + (second[1] - first[1]) * amount,
        ];
      };
      for (let row = 0; row < resolution; row += 1) {
        const topY = IMPLICIT_WORLD_EXTENT - row * step;
        const bottomY = topY - step;
        const rowOffset = row * (resolution + 1);
        const nextRowOffset = (row + 1) * (resolution + 1);
        for (let column = 0; column < resolution; column += 1) {
          const leftX = -IMPLICIT_WORLD_EXTENT + column * step;
          const rightX = leftX + step;
          const topLeftValue = values[rowOffset + column];
          const topRightValue = values[rowOffset + column + 1];
          const bottomRightValue = values[nextRowOffset + column + 1];
          const bottomLeftValue = values[nextRowOffset + column];
          if (![topLeftValue, topRightValue, bottomRightValue, bottomLeftValue].every(Number.isFinite)) continue;

          const topLeft: ScreenPoint = [leftX, topY];
          const topRight: ScreenPoint = [rightX, topY];
          const bottomRight: ScreenPoint = [rightX, bottomY];
          const bottomLeft: ScreenPoint = [leftX, bottomY];
          const top = interpolate(topLeft, topRight, topLeftValue, topRightValue);
          const right = interpolate(topRight, bottomRight, topRightValue, bottomRightValue);
          const bottom = interpolate(bottomLeft, bottomRight, bottomLeftValue, bottomRightValue);
          const left = interpolate(topLeft, bottomLeft, topLeftValue, bottomLeftValue);
          const mask =
            (topLeftValue < 0 ? 1 : 0)
            | (topRightValue < 0 ? 2 : 0)
            | (bottomRightValue < 0 ? 4 : 0)
            | (bottomLeftValue < 0 ? 8 : 0);
          const centerValue = (topLeftValue + topRightValue + bottomRightValue + bottomLeftValue) / 4;
          const addSegment = (start: ScreenPoint, end: ScreenPoint) => segments.push({ start, end });

          switch (mask) {
            case 1: addSegment(left, top); break;
            case 2: addSegment(top, right); break;
            case 3: addSegment(left, right); break;
            case 4: addSegment(right, bottom); break;
            case 5:
              if (centerValue < 0) {
                addSegment(top, right);
                addSegment(bottom, left);
              } else {
                addSegment(left, top);
                addSegment(right, bottom);
              }
              break;
            case 6: addSegment(top, bottom); break;
            case 7: addSegment(left, bottom); break;
            case 8: addSegment(bottom, left); break;
            case 9: addSegment(top, bottom); break;
            case 10:
              if (centerValue < 0) {
                addSegment(left, top);
                addSegment(right, bottom);
              } else {
                addSegment(top, right);
                addSegment(bottom, left);
              }
              break;
            case 11: addSegment(right, bottom); break;
            case 12: addSegment(left, right); break;
            case 13: addSegment(top, right); break;
            case 14: addSegment(left, top); break;
            default: break;
          }
        }
      }
      contour.push(...stitchContourSegments(segments));
    }

    return { progress: frameProgress, phase, line, trailOne, trailTwo, points, vector, contour };
  }, [evaluator, range, speed]);

  useEffect(() => {
    const signature = [
      equation,
      mode,
      speed,
      viewportRange.xMin,
      viewportRange.xMax,
      viewportRange.tMin,
      viewportRange.tMax,
    ].join('|');
    frameCacheRef.current.clear();
    const buildToken = ++frameCacheBuildRef.current;
    let cursor = 0;
    let idleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const idleWindow = window as typeof window & {
      requestIdleCallback?: (callback: (deadline: { timeRemaining: () => number }) => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const schedule = (callback: (deadline?: { timeRemaining: () => number }) => void) => {
      if (idleWindow.requestIdleCallback) {
        idleHandle = idleWindow.requestIdleCallback(callback);
      } else {
        timeoutHandle = window.setTimeout(() => callback(), 0);
      }
    };
    const build = (deadline?: { timeRemaining: () => number }) => {
      if (buildToken !== frameCacheBuildRef.current) return;
      const startedAt = performance.now();
      while (cursor < FRAME_CACHE_SIZE && (cursor === 0 || (deadline?.timeRemaining() ?? 0) > 5) && performance.now() - startedAt < 12) {
        frameCacheRef.current.set(cursor, createFrameBuffer(cursor));
        cursor += 1;
      }
      if (cursor < FRAME_CACHE_SIZE) schedule(build);
    };
    schedule(build);
    return () => {
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
      if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
    };
  }, [createFrameBuffer, equation, mode, range]);

  useEffect(() => {
    const startRange = viewportRangeRef.current;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const amount = easeInOutCubic((now - startedAt) / 320);
      const next = {
        xMin: startRange.xMin + (range.xMin - startRange.xMin) * amount,
        xMax: startRange.xMax + (range.xMax - startRange.xMax) * amount,
        tMin: startRange.tMin + (range.tMin - startRange.tMin) * amount,
        tMax: startRange.tMax + (range.tMax - startRange.tMax) * amount,
      };
      viewportRangeRef.current = next;
      setViewportRange(next);
      if (amount < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [range]);

  useEffect(() => {
    const canvas = webglCanvasRef.current;
    if (!canvas) return;
    let context: WebGL2RenderingContext | WebGLRenderingContext | null = null;
    try {
      context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    } catch {
      context = null;
    }
    if (!context) {
      onRuntimeWarning('WebGL unavailable; showing the projected 3D surface fallback.');
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        context,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
    } catch {
      onRuntimeWarning('WebGL renderer unavailable; showing the projected 3D surface fallback.');
      return;
    }
    const fullPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const interactionPixelRatio = Math.min(fullPixelRatio, 0.85);
    let activePixelRatio = fullPixelRatio;
    const setRenderQuality = (active: boolean) => {
      const nextRatio = active ? interactionPixelRatio : fullPixelRatio;
      if (nextRatio === activePixelRatio) return;
      activePixelRatio = nextRatio;
      renderer.setPixelRatio(nextRatio);
      resize();
    };
    const scene = new THREE.Scene();
    threeSceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 100);
    camera.position.set(5.2, 3.1, 6.8);
    camera.lookAt(0, 0, 0);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = true;
    controls.screenSpacePanning = false;
    controls.minDistance = 2.5;
    controls.maxDistance = 16;
    controls.target.set(0, 0, 0);
    controls.update();

    const starPositions = new Float32Array(240 * 3);
    for (let index = 0; index < starPositions.length; index += 3) {
      starPositions[index] = (Math.random() - 0.5) * 12;
      starPositions[index + 1] = (Math.random() - 0.5) * 8;
      starPositions[index + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        color: new THREE.Color('#c7f36b'),
        size: 0.025,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(stars);
    const surfaceGroup = new THREE.Group();
    scene.add(surfaceGroup);
    threeSurfaceGroupRef.current = surfaceGroup;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      renderer.setSize(Math.max(1, bounds.width), Math.max(1, bounds.height), false);
      camera.aspect = Math.max(1, bounds.width) / Math.max(1, bounds.height);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    const handleControlStart = () => {
      lastSurfaceBuildRef.current = 0;
      setRenderQuality(true);
      setSurfaceQuality('draft');
    };
    const handleControlEnd = () => {
      lastSurfaceBuildRef.current = 0;
      setRenderQuality(false);
      setSurfaceQuality('final');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'q' && event.key !== 'e') return;
      surfaceGroup.rotation.z += event.key === 'q' ? -0.08 : 0.08;
      event.preventDefault();
    };
    canvas.style.pointerEvents = mode === 'implicit3d' ? 'auto' : 'none';
    canvas.tabIndex = mode === 'implicit3d' ? 0 : -1;
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('end', handleControlEnd);
    canvas.addEventListener('keydown', handleKeyDown);
    let frame = 0;
    const render = (now: number) => {
      stars.rotation.z = now * 0.000012;
      stars.rotation.y = now * 0.000018;
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('end', handleControlEnd);
      canvas.removeEventListener('keydown', handleKeyDown);
      controls.dispose();
      observer.disconnect();
      starsGeometry.dispose();
      stars.material.dispose();
      surfaceGroup.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      renderer.dispose();
      threeSceneRef.current = null;
      threeSurfaceGroupRef.current = null;
      threeSurfaceGeometryRef.current?.dispose();
      threeSurfaceGeometryRef.current = null;
      threeSurfaceReadyRef.current = false;
    };
  }, [mode]);

  useEffect(() => {
    if (mode !== 'implicit3d') return;
    let worker: Worker;
    try {
      worker = new Worker(new URL('./workers/implicit-surface.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      onRuntimeWarning('3D worker unavailable; using the CPU surface fallback.');
      return;
    }

    const disposeSurface = () => {
      const group = threeSurfaceGroupRef.current;
      group?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      group?.clear();
      threeSurfaceGeometryRef.current?.dispose();
      threeSurfaceGeometryRef.current = null;
      threeSurfaceReadyRef.current = false;
    };

    const installSurface = (positions: ArrayBufferLike, indices?: ArrayBufferLike) => {
      const group = threeSurfaceGroupRef.current;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(positions), 3));
      if (indices && new Uint32Array(indices).length > 0) {
        geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
      } else if (geometry.getAttribute('position')?.count) {
        const smoothedGeometry = mergeVertices(geometry, 0.005);
        geometry.dispose();
        smoothedGeometry.computeVertexNormals();
        smoothedGeometry.computeBoundingSphere();
        installSurface(smoothedGeometry.getAttribute('position').array.buffer, smoothedGeometry.getIndex()?.array.buffer);
        return;
      }
      if (geometry.getAttribute('position')?.count === 0) {
        geometry.dispose();
        return;
      }
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      disposeSurface();
      threeSurfaceGeometryRef.current = geometry;
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(surfaceColorRef.current) },
          uOpacity: { value: 0.94 },
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
            vViewPosition = viewPosition.xyz;
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * viewPosition;
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          uniform float uOpacity;
          varying vec3 vNormal;
          varying vec3 vViewPosition;
          void main() {
            vec3 lightDirection = normalize(vec3(-0.45, 0.72, 0.85));
            float diffuse = 0.34 + 0.66 * max(dot(normalize(vNormal), lightDirection), 0.0);
            float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(-vViewPosition)), 0.0), 2.0);
            vec3 shaded = uColor * diffuse + vec3(0.34, 0.52, 0.16) * rim * 0.42;
            gl_FragColor = vec4(shaded, uOpacity);
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
      });
      group?.add(new THREE.Mesh(geometry, material));
      threeSurfaceReadyRef.current = true;
      onRenderStart();
      onRenderStatus('ready');
    };

    installSurfaceRef.current = installSurface;
    surfaceWorkerRef.current = worker;
    worker.onmessage = (event: MessageEvent<ImplicitSurfaceWorkerResult | ImplicitSurfaceWorkerError>) => {
      const result = event.data;
      if (result.id !== surfaceRequestIdRef.current) return;
      surfaceWorkerBusyRef.current = false;
      if (surfaceFallbackTimerRef.current !== null) {
        window.clearTimeout(surfaceFallbackTimerRef.current);
        surfaceFallbackTimerRef.current = null;
      }
      if (result.type === 'error') {
        onRuntimeWarning(`3D worker: ${result.message}`);
        return;
      }
      installSurface(result.positions, result.indices);
    };
    worker.onerror = () => onRuntimeWarning('3D surface worker stopped; the CPU fallback remains available.');

    return () => {
      if (surfaceRequestTimerRef.current !== null) {
        window.clearTimeout(surfaceRequestTimerRef.current);
        surfaceRequestTimerRef.current = null;
      }
      if (surfaceFallbackTimerRef.current !== null) {
        window.clearTimeout(surfaceFallbackTimerRef.current);
        surfaceFallbackTimerRef.current = null;
      }
      surfaceRequestIdRef.current += 1;
      surfaceQueueTokenRef.current += 1;
      surfaceRequestRef.current = null;
      surfaceWorkerBusyRef.current = false;
      surfaceInputKeyRef.current = '';
      worker.terminate();
      surfaceWorkerRef.current = null;
      installSurfaceRef.current = () => undefined;
      disposeSurface();
    };
  }, [mode, onRenderStart, onRenderStatus, onRuntimeWarning]);

  useEffect(() => {
    const group = threeSurfaceGroupRef.current;
    const disposeSurface = () => {
      group?.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((material) => material.dispose());
        else if (mesh.material) mesh.material.dispose();
      });
      group?.clear();
      threeSurfaceGeometryRef.current?.dispose();
      threeSurfaceGeometryRef.current = null;
      threeSurfaceReadyRef.current = false;
    };
    if (mode !== 'implicit3d' || evaluator?.kind !== 'implicit') {
      surfaceRequestIdRef.current += 1;
      surfaceQueueTokenRef.current += 1;
      surfaceRequestRef.current = null;
      surfaceWorkerBusyRef.current = false;
      surfaceInputKeyRef.current = '';
      disposeSurface();
      return;
    }

    const surfaceInputKey = `${equation}|${surfaceQuality}|${playing}`;
    const inputChanged = surfaceInputKeyRef.current !== surfaceInputKey;
    if (inputChanged) {
      surfaceInputKeyRef.current = surfaceInputKey;
      surfaceRequestIdRef.current += 1;
      surfaceWorkerBusyRef.current = false;
      surfaceWorkerRef.current?.postMessage({ type: 'cancel', id: surfaceRequestIdRef.current });
    }
    if (surfaceWorkerBusyRef.current) return;
    if (playing && threeSurfaceReadyRef.current && !inputChanged) return;

    const queueToken = ++surfaceQueueTokenRef.current;
    const request = {
      type: 'generate' as const,
      id: 0,
      equation,
      phase: progress * Math.PI * 2 * speed,
      speed,
      resolution: surfaceQuality === 'final' && !playing
        ? IMPLICIT_3D_FINAL_GRID_RESOLUTION
        : IMPLICIT_3D_DRAFT_GRID_RESOLUTION,
      extent: IMPLICIT_3D_WORLD_EXTENT,
    };
    surfaceRequestRef.current = request;
    const worker = surfaceWorkerRef.current;
    if (!worker) {
      const fallbackTimer = window.setTimeout(() => {
        if (queueToken !== surfaceQueueTokenRef.current) return;
        const geometry = createImplicitSurfaceGeometry(evaluator.expression, request.phase, speed, request.resolution);
        const positions = geometry.getAttribute('position')?.array.buffer;
        if (positions) installSurfaceRef.current(positions);
        geometry.dispose();
      }, 0);
      return () => window.clearTimeout(fallbackTimer);
    }

    const minimumInterval = surfaceQuality === 'final' ? 180 : 60;
    const wait = Math.max(0, lastSurfaceBuildRef.current + minimumInterval - performance.now());
    if (surfaceRequestTimerRef.current === null) {
      surfaceRequestTimerRef.current = window.setTimeout(() => {
        surfaceRequestTimerRef.current = null;
        const latestRequest = surfaceRequestRef.current;
        if (!latestRequest) return;
        lastSurfaceBuildRef.current = performance.now();
        const requestId = ++surfaceRequestIdRef.current;
        surfaceWorkerBusyRef.current = true;
        worker.postMessage({ ...latestRequest, id: requestId });
        surfaceFallbackTimerRef.current = window.setTimeout(() => {
          surfaceFallbackTimerRef.current = null;
          if (!surfaceWorkerBusyRef.current || requestId !== surfaceRequestIdRef.current) return;
          surfaceWorkerBusyRef.current = false;
          surfaceRequestIdRef.current += 1;
          worker.postMessage({ type: 'cancel', id: surfaceRequestIdRef.current });
          const fallbackGeometry = createImplicitSurfaceGeometry(
            evaluator.expression,
            latestRequest.phase,
            latestRequest.speed,
            IMPLICIT_3D_DRAFT_GRID_RESOLUTION,
          );
          const fallbackPositions = fallbackGeometry.getAttribute('position')?.array.buffer;
          if (fallbackPositions) installSurfaceRef.current(fallbackPositions);
          fallbackGeometry.dispose();
        }, 1400);
      }, wait);
    }
    return undefined;
  }, [equation, evaluator, mode, playing, progress, speed, surfaceQuality]);

  useEffect(() => {
    const scene = threeSceneRef.current;
    if (!scene || evaluator?.kind !== 'points') return;
    const group = new THREE.Group();
    const visibleCount = Math.min(evaluator.points.length, Math.max(1, Math.ceil(evaluator.points.length * easeInOutCubic(progress))));
    const pointCoordinates = evaluatePointSet(evaluator.points, progress * Math.PI * 2, speed);
    const visiblePoints = pointCoordinates.slice(0, Math.min(pointCoordinates.length, visibleCount));
    const positions = new Float32Array(visiblePoints.flatMap((point) => [point.x, point.y, 0]));
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    if (pointStyle === 'line' && visiblePoints.length >= 2) {
      group.add(new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 }),
      ));
    }
    if (pointStyle === 'particles' || visiblePoints.length < 2) {
      group.add(new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color,
          size: 0.095,
          transparent: true,
          opacity: 0.95,
          sizeAttenuation: true,
          blending: THREE.AdditiveBlending,
        }),
      ));
    }
    scene.add(group);
    return () => {
      scene.remove(group);
      geometry.dispose();
      group.children.forEach((child) => {
        if (child instanceof THREE.Line || child instanceof THREE.Points) {
          const material = child.material;
          if (Array.isArray(material)) material.forEach((item) => item.dispose());
          else material.dispose();
        }
      });
    };
  }, [color, evaluator, pointStyle, progress, speed]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(bounds.width * dpr));
    const height = Math.max(1, Math.floor(bounds.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = bounds.width;
    const h = bounds.height;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const normalizedEquation = normalizeForPreview(equation).toLowerCase();
    const cacheFrameIndex = Math.min(FRAME_CACHE_SIZE - 1, Math.max(0, Math.round(progress * (FRAME_CACHE_SIZE - 1))));
    let cachedFrame = frameCacheRef.current.get(cacheFrameIndex);
    if (!cachedFrame) {
      let nearestFrame: CachedFrame | undefined;
      let nearestDistance = Number.POSITIVE_INFINITY;
      frameCacheRef.current.forEach((candidate, index) => {
        const distance = Math.abs(index - cacheFrameIndex);
        if (distance < nearestDistance) {
          nearestFrame = candidate;
          nearestDistance = distance;
        }
      });
      cachedFrame = nearestFrame ?? createFrameBuffer(0);
      if (frameCacheRef.current.size === 0) frameCacheRef.current.set(0, cachedFrame);
    }
    const renderProgress = progress;
    const isParametricSpiral = mode === 'parametric'
      && /(?:^|[,(]\s*)t\s*\*\s*(?:sin|cos)|(?:sin|cos)\s*\(\s*t\s*\)\s*\*\s*t/.test(normalizedEquation);
    const isFunctionLike = mode === 'function' || mode === 'piecewise';
    const phase = cachedFrame.phase;
    const pointCoordinates = evaluator?.kind === 'points'
      ? cachedFrame.points
      : [];
    let scale = isFunctionLike
      ? Math.min(w / Math.max(1, viewportRange.xMax - viewportRange.xMin + 2), h / 22)
      : isParametricSpiral
        ? Math.min(w, h) / Math.max(2.4, viewportRange.tMax * 2.4)
        : Math.min(w, h) * 0.105;
    let plotCenterX = isFunctionLike ? (viewportRange.xMin + viewportRange.xMax) * 0.5 : 0;
    let plotCenterY = 0;
    if (!originView && (evaluator?.kind === 'function' || evaluator?.kind === 'parametric' || evaluator?.kind === 'polar')) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      cachedFrame.line.forEach((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
      if (Number.isFinite(minX) && Number.isFinite(maxX) && Number.isFinite(minY) && Number.isFinite(maxY)) {
        const spanX = Math.max(1, maxX - minX);
        const spanY = Math.max(1, maxY - minY);
        scale = Math.min(w / (spanX + 2), h / (spanY + 2)) * 0.9;
        plotCenterX = (minX + maxX) * 0.5;
        plotCenterY = (minY + maxY) * 0.5;
      }
    }
    if (!originView && evaluator?.kind === 'points' && pointCoordinates.length > 0) {
      const xValues = pointCoordinates.map((point) => point.x);
      const yValues = pointCoordinates.map((point) => point.y);
      const minX = Math.min(...xValues);
      const maxX = Math.max(...xValues);
      const minY = Math.min(...yValues);
      const maxY = Math.max(...yValues);
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      scale = Math.min(w / (spanX + 2), h / (spanY + 2));
       plotCenterX = (minX + maxX) * 0.5;
       plotCenterY = (minY + maxY) * 0.5;
    }
    if (originView) {
      plotCenterX = 0;
      plotCenterY = 0;
    }
    if (cameraSource) {
      if (!cameraFrame.scale || !Number.isFinite(cameraFrame.scale)) {
        cameraFrame.scale = scale;
        cameraFrame.centerX = plotCenterX;
        cameraFrame.centerY = plotCenterY;
      } else {
        // Ease toward new graph bounds so a new equation feels like a camera move.
        const cameraEase = 0.16;
        cameraFrame.scale += (scale - cameraFrame.scale) * cameraEase;
        cameraFrame.centerX += (plotCenterX - cameraFrame.centerX) * cameraEase;
        cameraFrame.centerY += (plotCenterY - cameraFrame.centerY) * cameraEase;
      }
    }
    scale = cameraFrame.scale * graphZoom;
    plotCenterX = cameraFrame.centerX;
    plotCenterY = cameraFrame.centerY;
    const originX = cx - plotCenterX * scale;
    const originY = cy + plotCenterY * scale;
    const drawProgress = easeInOutCubic(renderProgress);

    ctx.clearRect(0, 0, w, h);
    const isThreeDimensional = mode === 'implicit3d';
    if (!isThreeDimensional) {
      ctx.fillStyle = '#171a24';
      ctx.fillRect(0, 0, w, h);
    }
    if (showGrid && !isThreeDimensional) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(221, 217, 208, 0.075)';
       const gridStep = Math.max(14, scale * gridDensity);
       for (let x = ((originX % gridStep) + gridStep) % gridStep; x < w; x += gridStep) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
       for (let y = ((originY % gridStep) + gridStep) % gridStep; y < h; y += gridStep) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    }
    if (showAxes && !isThreeDimensional) {
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(221, 217, 208, 0.26)';
      ctx.beginPath();
      ctx.moveTo(0, originY);
      ctx.lineTo(w, originY);
      ctx.moveTo(originX, 0);
      ctx.lineTo(originX, h);
      ctx.stroke();
      ctx.fillStyle = 'rgba(221, 217, 208, 0.42)';
      ctx.font = '10px DM Mono, monospace';
      ctx.fillText('x', w - 19, originY - 9);
      ctx.fillText('y', originX + 9, 16);
    }

    let geometrySamples = 0;
    const trace = (drawPoint: (u: number) => [number, number], stroke = color, widthValue = lineWidth) => {
      ctx.beginPath();
      let penDown = false;
      const sampleCount = isFunctionLike ? 1000 : mode === 'polar' ? 900 : 650;
      for (let i = 0; i <= sampleCount; i += 1) {
        const normalized = i / sampleCount;
        if ((isFunctionLike || mode === 'parametric' || mode === 'polar') && normalized > drawProgress) break;
        const u = isFunctionLike
           ? viewportRange.xMin + normalized * (viewportRange.xMax - viewportRange.xMin)
          : mode === 'polar'
            ? normalized * Math.PI * 2
          : normalized * Math.PI * 7 - Math.PI * 3.5;
        const [x, y] = drawPoint(u);
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
          penDown = false;
          continue;
        }
        geometrySamples += 1;
        if (!penDown) {
          ctx.moveTo(originX + x * scale, originY - y * scale);
          penDown = true;
        } else {
          ctx.lineTo(originX + x * scale, originY - y * scale);
        }
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = widthValue;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    };
    const traceCached = (points: GraphPoint[], stroke = color, widthValue = lineWidth, revealProgress = drawProgress) => {
      const visibleCount = Math.max(1, Math.ceil(points.length * revealProgress));
      geometrySamples += visibleCount;
      ctx.beginPath();
      let penDown = false;
      points.slice(0, visibleCount).forEach((point) => {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
          penDown = false;
          return;
        }
        if (!penDown) {
          ctx.moveTo(originX + point.x * scale, originY - point.y * scale);
          penDown = true;
        } else {
          ctx.lineTo(originX + point.x * scale, originY - point.y * scale);
        }
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = widthValue;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    };

    const renderImplicitContour = (currentPhase: number, stroke = color, widthValue = lineWidth, revealProgress = drawProgress) => {
      if (evaluator?.kind !== 'implicit') return;

      const usesAnimationValue = /(^|[^A-Za-z])(t|a|b)([^A-Za-z]|$)/i.test(equation);
      const phaseKey = usesAnimationValue ? Math.round(currentPhase * 18) : 0;
      const speedKey = /\bb\b/i.test(equation) ? speed.toFixed(3) : 'static';
      const cacheKey = [
        equation,
        Math.round(w),
        Math.round(h),
        phaseKey,
        speedKey,
        IMPLICIT_GRID_RESOLUTION,
      ].join('|');
      let contour = implicitContourCacheRef.current.get(cacheKey);

      if (!contour) {
        const resolution = IMPLICIT_GRID_RESOLUTION;
        const values = new Float32Array((resolution + 1) * (resolution + 1));
        const cellWidth = w / resolution;
        const cellHeight = h / resolution;

        for (let row = 0; row <= resolution; row += 1) {
          const screenY = row * cellHeight;
          const y = (originY - screenY) / scale;
          const rowOffset = row * (resolution + 1);
          for (let column = 0; column <= resolution; column += 1) {
            const screenX = column * cellWidth;
            const x = (screenX - originX) / scale;
            values[rowOffset + column] = evaluate(evaluator.expression, {
              x,
              y,
              t: currentPhase,
              a: currentPhase,
              b: speed,
              z: 0,
            });
          }
        }

        const segments: ContourSegment[] = [];
        const interpolate = (
          first: [number, number],
          second: [number, number],
          firstValue: number,
          secondValue: number,
        ): [number, number] => {
          const denominator = firstValue - secondValue;
          const amount = Math.abs(denominator) < 1e-12
            ? 0.5
            : Math.max(0, Math.min(1, firstValue / denominator));
          return [
            first[0] + (second[0] - first[0]) * amount,
            first[1] + (second[1] - first[1]) * amount,
          ];
        };

        for (let row = 0; row < resolution; row += 1) {
          const y = row * cellHeight;
          const nextY = y + cellHeight;
          const rowOffset = row * (resolution + 1);
          const nextRowOffset = (row + 1) * (resolution + 1);
          for (let column = 0; column < resolution; column += 1) {
            const x = column * cellWidth;
            const nextX = x + cellWidth;
            const topLeftValue = values[rowOffset + column];
            const topRightValue = values[rowOffset + column + 1];
            const bottomRightValue = values[nextRowOffset + column + 1];
            const bottomLeftValue = values[nextRowOffset + column];

            if (![topLeftValue, topRightValue, bottomRightValue, bottomLeftValue].every(Number.isFinite)) {
              continue;
            }

            const topLeft: [number, number] = [x, y];
            const topRight: [number, number] = [nextX, y];
            const bottomRight: [number, number] = [nextX, nextY];
            const bottomLeft: [number, number] = [x, nextY];
            const top = interpolate(topLeft, topRight, topLeftValue, topRightValue);
            const right = interpolate(topRight, bottomRight, topRightValue, bottomRightValue);
            const bottom = interpolate(bottomLeft, bottomRight, bottomLeftValue, bottomRightValue);
            const leftEdge = interpolate(topLeft, bottomLeft, topLeftValue, bottomLeftValue);
            const mask =
              (topLeftValue < 0 ? 1 : 0)
              | (topRightValue < 0 ? 2 : 0)
              | (bottomRightValue < 0 ? 4 : 0)
              | (bottomLeftValue < 0 ? 8 : 0);
            const centerValue = (topLeftValue + topRightValue + bottomRightValue + bottomLeftValue) / 4;

            const addSegment = (start: ScreenPoint, end: ScreenPoint) => {
              segments.push({ start, end });
            };

            switch (mask) {
              case 1: addSegment(leftEdge, top); break;
              case 2: addSegment(top, right); break;
              case 3: addSegment(leftEdge, right); break;
              case 4: addSegment(right, bottom); break;
              case 5:
                if (centerValue < 0) {
                  addSegment(top, right);
                  addSegment(bottom, leftEdge);
                } else {
                  addSegment(leftEdge, top);
                  addSegment(right, bottom);
                }
                break;
              case 6: addSegment(top, bottom); break;
              case 7: addSegment(leftEdge, bottom); break;
              case 8: addSegment(bottom, leftEdge); break;
              case 9: addSegment(top, bottom); break;
              case 10:
                if (centerValue < 0) {
                  addSegment(leftEdge, top);
                  addSegment(right, bottom);
                } else {
                  addSegment(top, right);
                  addSegment(bottom, leftEdge);
                }
                break;
              case 11: addSegment(right, bottom); break;
              case 12: addSegment(leftEdge, right); break;
              case 13: addSegment(top, right); break;
              case 14: addSegment(leftEdge, top); break;
              default: break;
            }
          }
        }

        contour = stitchContourSegments(segments);
        implicitContourCacheRef.current.set(cacheKey, contour);
        while (implicitContourCacheRef.current.size > IMPLICIT_CACHE_LIMIT) {
          const oldestKey = implicitContourCacheRef.current.keys().next().value;
          if (!oldestKey) break;
          implicitContourCacheRef.current.delete(oldestKey);
        }
      }

      ctx.beginPath();
      geometrySamples += contour.reduce((total, polyline) => total + Math.max(0, polyline.length - 1), 0);
      contour.forEach((polyline) => {
        if (polyline.length < 2) return;
        const visibleCount = Math.max(2, Math.ceil(polyline.length * revealProgress));
        ctx.moveTo(polyline[0][0], polyline[0][1]);
        for (let index = 1; index < Math.min(polyline.length, visibleCount); index += 1) {
          ctx.lineTo(polyline[index][0], polyline[index][1]);
        }
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = widthValue;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.imageSmoothingEnabled = true;
      ctx.stroke();
    };
    const renderCachedImplicitContour = (
      polylines: WorldContourPolyline[],
      stroke = color,
      widthValue = lineWidth,
      revealProgress = drawProgress,
    ) => {
      ctx.beginPath();
      polylines.forEach((polyline) => {
        if (polyline.length < 2) return;
        const visibleCount = Math.max(2, Math.ceil(polyline.length * revealProgress));
        const first = polyline[0];
        ctx.moveTo(originX + first[0] * scale, originY - first[1] * scale);
        for (let index = 1; index < Math.min(polyline.length, visibleCount); index += 1) {
          const point = polyline[index];
          ctx.lineTo(originX + point[0] * scale, originY - point[1] * scale);
        }
      });
      geometrySamples += polylines.reduce((total, polyline) => total + Math.max(0, polyline.length - 1), 0);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = widthValue;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.imageSmoothingEnabled = true;
      ctx.stroke();
    };
    const renderImplicit3dFallback = () => {
      const positionAttribute = threeSurfaceGeometryRef.current?.getAttribute('position');
      if (!positionAttribute) return;
      const positions = positionAttribute.array as ArrayLike<number>;
      const fallbackScale = Math.min(w, h) / (IMPLICIT_3D_WORLD_EXTENT * 2.35);
      const fallbackCenterX = w * 0.5;
      const fallbackCenterY = h * 0.53;
      const triangles: Array<{
        points: Array<[number, number]>;
        depth: number;
      }> = [];
      for (let index = 0; index + 8 < positions.length; index += 9) {
        const project = (offset: number): [number, number, number] => {
          const x = Number(positions[index + offset]);
          const y = Number(positions[index + offset + 1]);
          const z = Number(positions[index + offset + 2]);
          return [
            fallbackCenterX + (x * 0.82 + z * 0.52) * fallbackScale,
            fallbackCenterY - (y * 0.86 - z * 0.34) * fallbackScale,
            x * 0.16 - z * 0.72 + y * 0.04,
          ];
        };
        const first = project(0);
        const second = project(3);
        const third = project(6);
        triangles.push({
          points: [[first[0], first[1]], [second[0], second[1]], [third[0], third[1]]],
          depth: (first[2] + second[2] + third[2]) / 3,
        });
      }
      triangles.sort((first, second) => first.depth - second.depth);
      ctx.save();
      ctx.lineJoin = 'round';
      triangles.forEach(({ points, depth }) => {
        const alpha = 0.14 + Math.max(0, Math.min(1, (depth + 3) / 6)) * 0.2;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        ctx.lineTo(points[2][0], points[2][1]);
        ctx.closePath();
        ctx.fill();
      });
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(0.8, lineWidth * 0.65);
      triangles.forEach(({ points }, index) => {
        if (index % 7 !== 0) return;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        ctx.lineTo(points[2][0], points[2][1]);
        ctx.closePath();
        ctx.stroke();
      });
      ctx.restore();
      geometrySamples += triangles.length;
    };

    const renderPoints = (points: GraphPoint[], stroke = color) => {
      const visiblePoints = points.slice(0, Math.min(points.length, Math.max(1, Math.ceil(points.length * drawProgress))));
      geometrySamples += visiblePoints.length;
      if (pointStyle === 'line' && visiblePoints.length >= 2) {
        ctx.beginPath();
        visiblePoints.forEach((point, index) => {
          const screenX = originX + point.x * scale;
          const screenY = originY - point.y * scale;
          if (index === 0) ctx.moveTo(screenX, screenY);
          else ctx.lineTo(screenX, screenY);
        });
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
      }
      ctx.fillStyle = stroke;
      visiblePoints.forEach((point) => {
        ctx.beginPath();
        ctx.arc(originX + point.x * scale, originY - point.y * scale, pointStyle === 'particles' ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const reportRuntimeWarning = (detail: string) => {
      if (runtimeWarningRef.current) return;
      runtimeWarningRef.current = true;
      const message = `Runtime evaluation warning in ${mode}: ${detail}`;
      console.warn(`[Math Rendering] ${message}`);
      onRuntimeWarning(message);
    };

    const renderVectorField = (field: Extract<GraphEvaluator, { kind: 'vector' }>, stroke = color) => {
      const density = 8;
      const extent = 4.5;
      const total = (density * 2 + 1) ** 2;
      const visibleCount = Math.max(1, Math.ceil(total * drawProgress));
      let arrowIndex = 0;
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, lineWidth * 0.82);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let row = -density; row <= density; row += 1) {
        for (let column = -density; column <= density; column += 1) {
          if (arrowIndex >= visibleCount) return;
          arrowIndex += 1;
          const x = (column / density) * extent;
          const y = (row / density) * extent;
          const vx = evaluate(field.x, { x, y, t: phase, a: phase, b: speed, z: 0 });
          const vy = evaluate(field.y, { x, y, t: phase, a: phase, b: speed, z: 0 });
          const magnitude = Math.hypot(vx, vy);
          if (!Number.isFinite(magnitude) || magnitude < 1e-6) continue;
           geometrySamples += 1;
          const length = Math.min(0.65, Math.max(0.18, magnitude * 0.16));
          const endX = x + (vx / magnitude) * length;
          const endY = y + (vy / magnitude) * length;
          const screenX = originX + x * scale;
          const screenY = originY - y * scale;
          const screenEndX = originX + endX * scale;
          const screenEndY = originY - endY * scale;
          const angle = Math.atan2(screenEndY - screenY, screenEndX - screenX);
          const head = Math.min(7, Math.max(3, scale * 0.07));
          ctx.beginPath();
          ctx.moveTo(screenX, screenY);
          ctx.lineTo(screenEndX, screenEndY);
          ctx.moveTo(screenEndX, screenEndY);
          ctx.lineTo(screenEndX - head * Math.cos(angle - Math.PI / 6), screenEndY - head * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(screenEndX, screenEndY);
          ctx.lineTo(screenEndX - head * Math.cos(angle + Math.PI / 6), screenEndY - head * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    };
    const renderCachedVectorField = (arrows: CachedVectorArrow[], stroke = color) => {
      const visibleCount = Math.max(1, Math.ceil(arrows.length * drawProgress));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = Math.max(1, lineWidth * 0.82);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      arrows.slice(0, visibleCount).forEach(({ x, y, endX, endY }) => {
        const screenX = originX + x * scale;
        const screenY = originY - y * scale;
        const screenEndX = originX + endX * scale;
        const screenEndY = originY - endY * scale;
        const angle = Math.atan2(screenEndY - screenY, screenEndX - screenX);
        const head = Math.min(7, Math.max(3, scale * 0.07));
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenEndX, screenEndY);
        ctx.moveTo(screenEndX, screenEndY);
        ctx.lineTo(screenEndX - head * Math.cos(angle - Math.PI / 6), screenEndY - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(screenEndX, screenEndY);
        ctx.lineTo(screenEndX - head * Math.cos(angle + Math.PI / 6), screenEndY - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      });
    };

    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    const evaluate = (expression: CompiledExpression, scope: Record<string, number>) => {
      try {
        const value = Number(expression.evaluate(scope));
        if (!Number.isFinite(value)) {
          reportRuntimeWarning('a sample returned a non-finite value; that sample was skipped.');
          return Number.NaN;
        }
        return value;
      } catch (error) {
        reportRuntimeWarning(error instanceof Error ? error.message : 'a sample could not be evaluated; it was skipped.');
        return Number.NaN;
      }
    };
    const fn = (u: number, currentPhase = phase): [number, number] => {
      if (evaluator?.kind === 'parametric') {
        const normalized = (u + Math.PI * 3.5) / (Math.PI * 7);
         const parameter = viewportRange.tMin
           + (viewportRange.tMax - viewportRange.tMin) * normalized * Math.max(drawProgress, 0.001);
        return [
          evaluate(evaluator.x, { t: parameter, a: currentPhase, b: speed, z: 0 }),
          evaluate(evaluator.y, { t: parameter, a: currentPhase, b: speed, z: 0 }),
        ];
      }
      if (evaluator?.kind === 'polar') {
        const normalized = u / (Math.PI * 2);
        const theta = viewportRange.tMin
          + (viewportRange.tMax - viewportRange.tMin) * normalized * Math.max(drawProgress, 0.001);
        const radius = evaluate(evaluator.expression, { theta, t: currentPhase, a: currentPhase, b: speed, z: 0 });
        return [radius * Math.cos(theta), radius * Math.sin(theta)];
      }
      if (evaluator?.kind === 'implicit') {
        let bestRadius = Number.NaN;
        let bestAbs = Number.POSITIVE_INFINITY;
        let previous = Number.NaN;
        for (let step = 0; step <= 48; step += 1) {
          const radius = (step / 48) * 4;
          const value = evaluate(evaluator.expression, {
            x: radius * Math.cos(u),
            y: radius * Math.sin(u),
            t: currentPhase,
            a: currentPhase,
            b: speed,
            z: 0,
          });
          if (Number.isFinite(value) && Math.abs(value) < bestAbs) {
            bestAbs = Math.abs(value);
            bestRadius = radius;
          }
          if (Number.isFinite(previous) && Number.isFinite(value) && previous * value < 0) {
            bestRadius = radius - (1 / 48) * 2;
            break;
          }
          previous = value;
        }
        return [bestRadius * Math.cos(u), bestRadius * Math.sin(u)];
      }
      if (evaluator?.kind === 'function') {
        const x = u;
        const rawY = evaluate(evaluator.expression, { x, t: currentPhase, a: currentPhase, b: speed, z: 0 });
        const y = /(?:exp|e\^)/i.test(equation)
          ? Number.isFinite(rawY) ? Math.max(-50, Math.min(50, rawY)) : Math.sign(rawY || 1) * 50
          : rawY;
        return [x, y];
      }
      return [Number.NaN, Number.NaN];
    };
    if (evaluator?.kind === 'points') {
      if (showTrail) {
        ctx.shadowBlur = 0;
       renderPoints(pointCoordinates.slice(0, Math.max(0, Math.ceil(pointCoordinates.length * Math.max(drawProgress - 0.14, 0)))), 'rgba(199, 243, 107, .22)');
        ctx.shadowBlur = 14;
      }
      renderPoints(pointCoordinates);
    } else if (evaluator?.kind === 'vector') {
      if (cachedFrame.vector.length > 0) renderCachedVectorField(cachedFrame.vector);
      else renderVectorField(evaluator);
    } else if (evaluator?.kind === 'implicit' && mode !== 'implicit3d') {
      if (showTrail) {
        ctx.shadowBlur = 0;
         if (cachedFrame.contour.length > 0) {
           renderCachedImplicitContour(cachedFrame.contour, 'rgba(199, 243, 107, .18)', Math.max(1, lineWidth - 0.75), Math.max(drawProgress - 0.14, 0));
         } else {
           renderImplicitContour(phase - 0.38, 'rgba(199, 243, 107, .18)', Math.max(1, lineWidth - 0.75), Math.max(drawProgress - 0.14, 0));
         }
        ctx.shadowBlur = 14;
      }
       if (cachedFrame.contour.length > 0) renderCachedImplicitContour(cachedFrame.contour);
       else renderImplicitContour(phase);
    } else if (mode === 'implicit3d' && evaluator?.kind === 'implicit' && !threeSceneRef.current) {
      renderImplicit3dFallback();
    } else if (evaluator && mode !== 'implicit3d') {
      if (cachedFrame.line.length > 0) {
        if (showTrail) {
          ctx.shadowBlur = 0;
          traceCached(cachedFrame.trailOne, 'rgba(199, 243, 107, .18)', Math.max(1, lineWidth - 0.75));
          traceCached(cachedFrame.trailTwo, 'rgba(199, 243, 107, .3)', Math.max(1, lineWidth - 0.4));
          ctx.shadowBlur = 14;
        }
        traceCached(cachedFrame.line);
      } else {
        if (showTrail) {
          ctx.shadowBlur = 0;
          trace((u) => fn(u, phase - 0.38), 'rgba(199, 243, 107, .18)', Math.max(1, lineWidth - 0.75));
          trace((u) => fn(u, phase - 0.18), 'rgba(199, 243, 107, .3)', Math.max(1, lineWidth - 0.4));
          ctx.shadowBlur = 14;
        }
        trace(fn);
      }
    }
    ctx.restore();

    if (mode === 'implicit' && evaluator?.kind === 'implicit') {
      ctx.save();
      ctx.setLineDash([3, 6]);
      trace((u) => [(1.45 + 0.12 * Math.sin(phase)) * Math.cos(u), (1.45 + 0.12 * Math.sin(phase)) * Math.sin(u)], '#ff8b6d', 1.1);
      ctx.restore();
    }
    if (evaluator && evaluator.kind !== 'points' && evaluator.kind !== 'vector' && mode !== 'implicit3d') {
      ctx.fillStyle = 'rgba(199, 243, 107, .9)';
      ctx.beginPath();
       const markerParameter = isFunctionLike
         ? viewportRange.xMin + drawProgress * (viewportRange.xMax - viewportRange.xMin)
        : mode === 'parametric'
          ? drawProgress * Math.PI * 7 - Math.PI * 3.5
          : mode === 'polar'
            ? drawProgress * Math.PI * 2
            : phase;
      const markerIndex = Math.min(
        Math.max(0, cachedFrame.line.length - 1),
        Math.round(drawProgress * Math.max(0, cachedFrame.line.length - 1)),
      );
      const marker = cachedFrame.line.length > 0
        ? [cachedFrame.line[markerIndex].x, cachedFrame.line[markerIndex].y] as [number, number]
        : fn(markerParameter);
      ctx.arc(originX + marker[0] * scale, originY - marker[1] * scale, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    let hasNonEmptyPixels = pixelVerificationFramesRef.current > 0;
    if (!healthReportedRef.current) {
      try {
        const sampleWidth = Math.max(1, Math.min(canvas.width, 320));
        const sampleHeight = Math.max(1, Math.min(canvas.height, 180));
        const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index + 3] > 0 && (pixels[index] > 42 || pixels[index + 1] > 42 || pixels[index + 2] > 42)) {
            hasNonEmptyPixels = true;
            break;
          }
        }
        if (!hasNonEmptyPixels && mode === 'implicit3d' && webglCanvasRef.current) {
          const webgl = webglCanvasRef.current.getContext('webgl2') ?? webglCanvasRef.current.getContext('webgl');
          if (webgl) {
            const pixel = new Uint8Array(4);
            webgl.readPixels(0, 0, 1, 1, webgl.RGBA, webgl.UNSIGNED_BYTE, pixel);
            hasNonEmptyPixels = pixel[3] > 0;
          }
        }
      } catch {
        hasNonEmptyPixels = false;
      }
    }
    pixelVerificationFramesRef.current = hasNonEmptyPixels
      ? pixelVerificationFramesRef.current + 1
      : 0;
    if (mode === 'implicit3d' && evaluator?.kind === 'implicit') {
      // The WebGL surface owns the 3D draw path; the transparent 2D layer
      // must not mark a valid volumetric render as an empty XY slice.
      geometrySamples = threeSurfaceReadyRef.current ? 1 : 0;
    }
    if (evaluator && mode !== 'implicit3d') {
      if (geometrySamples === 0 || pixelVerificationFramesRef.current === 0) {
        renderHealthFramesRef.current += 1;
        if (renderHealthFramesRef.current >= 4 && !healthReportedRef.current) {
          healthReportedRef.current = true;
          onRenderStatus('error', geometrySamples === 0
            ? 'Animation engine could not evaluate coordinates for this domain. Try Auto Range, reset the viewport, or simplify the expression.'
            : 'The canvas is blank after rendering. Try Auto Range, reset the viewport, or simplify the expression.');
        }
      } else {
        renderHealthFramesRef.current += 1;
        if ((!animationExpected || renderHealthFramesRef.current >= 2) && pixelVerificationFramesRef.current >= 2 && !healthReportedRef.current) {
          healthReportedRef.current = true;
          onRenderStart();
          onRenderStatus('ready');
        }
      }
    }
  }, [animationExpected, cameraFrame, cameraSource, color, createFrameBuffer, equation, evaluator, graphZoom, gridDensity, lineWidth, mode, onRenderStart, onRenderStatus, onRuntimeWarning, originView, pointStyle, progress, showAxes, showGrid, showTrail, speed, viewportRange]);

  drawRef.current = draw;
  useEffect(() => {
    runtimeWarningRef.current = false;
    renderHealthFramesRef.current = 0;
    pixelVerificationFramesRef.current = 0;
    healthReportedRef.current = false;
    implicitContourCacheRef.current.clear();
  }, [animationExpected, equation, mode]);
  useEffect(() => {
    draw();
  }, [draw]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="graph-renderer">
      <canvas ref={webglCanvasRef} className="webgl-canvas" aria-hidden="true" />
      <canvas ref={canvasRef} className="graph-canvas" data-testid="canvas-graph-renderer" aria-label={`Animated ${mode} graph for ${equation}`} />
    </div>
  );
}

function MainStudio() {
  const launchParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const launchEquation = launchParams.get('equation') || DEFAULT_EQUATION;
  const launchModeParam = launchParams.get('mode');
  const launchMode: StudioMode = isStudioMode(launchModeParam) ? launchModeParam : 'auto';
  const launchResolvedMode: ResolvedStudioMode = launchMode === 'auto' ? detectSmartMode(launchEquation) : launchMode;
  const [equation, setEquation] = useState(launchEquation);
  const [mode, setMode] = useState<StudioMode>(launchMode);
  const [layers, setLayers] = useState<EquationLayer[]>([
    { id: 1, equation: launchEquation, mode: launchResolvedMode, color: '#c7f36b', visible: true },
  ]);
  const [activeLayerId, setActiveLayerId] = useState(1);
  const [theme, setTheme] = useState<StudioTheme>(() => {
    try { return (localStorage.getItem('second-solution-theme') as StudioTheme) || 'dark'; } catch { return 'dark'; }
  });
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [autoRange, setAutoRange] = useState(true);
  const [manualXMin, setManualXMin] = useState(-10);
  const [manualXMax, setManualXMax] = useState(10);
  const [manualTMin, setManualTMin] = useState(0);
  const [manualTMax, setManualTMax] = useState(2 * Math.PI);
  const [speed, setSpeed] = useState(1);
  const [duration, setDuration] = useState(8);
  const [lineWidth, setLineWidth] = useState(2);
  const [color, setColor] = useState('#c7f36b');
  const [showGrid, setShowGrid] = useState(true);
  const [gridDensity, setGridDensity] = useState(1);
  const [showAxes, setShowAxes] = useState(true);
  const [showTrail, setShowTrail] = useState(false);
  const [pointStyle, setPointStyle] = useState<'line' | 'particles'>('line');
  const [originView, setOriginView] = useState(false);
  const [showFps, setShowFps] = useState(true);
  const [showWatermark, setShowWatermark] = useState(true);
  const [pageZoom, setPageZoom] = useState(1);
  const [graphZoom, setGraphZoom] = useState(1);
  const [watermark, setWatermark] = useState('Second Solution Studio');
  const [filename, setFilename] = useState('');
  const [fps, setFps] = useState(60);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [renderStarted, setRenderStarted] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [topNotice, setTopNotice] = useState('');
  const [parserWarning, setParserWarning] = useState('');
  const [runtimeWarning, setRuntimeWarning] = useState('');
  const [renderHealth, setRenderHealth] = useState<'checking' | 'ready' | 'error'>('checking');
  const [renderHealthMessage, setRenderHealthMessage] = useState('');
  const [showGraphMaker, setShowGraphMaker] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem('second-solution-history') || localStorage.getItem('mae-history') || '[]';
      return (JSON.parse(raw) as HistoryItem[]).slice(0, 8);
    } catch {
      return [];
    }
  });
  const [editHistory, setEditHistory] = useState<string[]>([launchEquation]);
  const [editHistoryIndex, setEditHistoryIndex] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState('');
  const [parsedEquation, setParsedEquation] = useState(launchEquation);
  const lastHistoryKey = useRef('');
  const editHistoryRef = useRef<string[]>([launchEquation]);
  const editHistoryIndexRef = useRef(0);
  const progressRef = useRef(progress);
  const sharedCameraFrameRef = useRef({ scale: 0, centerX: 0, centerY: 0 });
  const skipNextSceneResetRef = useRef(true);
  const sessionSnapshotRef = useRef<StudioSessionState | null>(null);
  const sessionSaveTimerRef = useRef<number | null>(null);
  const captureActiveRef = useRef(false);
  const captureRafRef = useRef<number | null>(null);
  const captureStopTimerRef = useRef<number | null>(null);
  const audioEngineRef = useRef<AudioEngine | null>(null);
  const audioLastProgressRef = useRef(-1);
  const audioLastYRef = useRef<number | null>(null);
  const audioLastDirectionRef = useRef(0);
  const audioLastBeatTimeRef = useRef(0);
  const allowUnloadRef = useRef(false);
  const canvasColumnRef = useRef<HTMLDivElement>(null);
  const equationInputRef = useRef<HTMLTextAreaElement>(null);
  const downloadPngRef = useRef<() => void>(() => undefined);
  const validation = useEquationValidator(parsedEquation, mode);
  useEffect(() => {
    const timer = window.setTimeout(() => setParsedEquation(equation), 300);
    return () => window.clearTimeout(timer);
  }, [equation]);
  const serverResult = validation.validatedKey === `${mode}:${parsedEquation.trim()}` ? validation.data : undefined;
  const renderEquation = parsedEquation;
  const localDetectedMode = useMemo(() => detectSmartMode(parsedEquation), [parsedEquation]);
  const resolvedMode: ResolvedStudioMode = mode === 'auto' ? (serverResult?.valid ? serverResult.mode : localDetectedMode) : mode;
  const animationExpected = serverResult?.valid ? serverResult.animatable : /\b(?:t|u|theta)\b/i.test(parsedEquation);
  const details = modeDetails[mode];
  useEffect(() => {
    let cancelled = false;
    const hasLaunchScene = launchParams.has('equation');
    if (hasLaunchScene) {
      try {
        localStorage.removeItem('second-solution-theme');
        localStorage.removeItem('second-solution-history');
      } catch {
        // Legacy values are best-effort migration inputs only.
      }
      setSessionReady(true);
      return () => { cancelled = true; };
    }

    void loadEncryptedJson<Partial<StudioSessionState>>(SESSION_STORAGE_KEY).then((saved) => {
      if (cancelled) return;
      if (saved) {
        const restoredEquation = typeof saved.equation === 'string' ? saved.equation : launchEquation;
        setEquation(restoredEquation);
        editHistoryRef.current = [restoredEquation];
        editHistoryIndexRef.current = 0;
        setEditHistory([restoredEquation]);
        setEditHistoryIndex(0);
        if (isStudioMode(saved.mode)) setMode(saved.mode);
        if (Array.isArray(saved.layers)) {
          const restoredLayers = saved.layers.filter((layer): layer is EquationLayer => (
            Boolean(layer)
            && typeof layer.id === 'number'
            && typeof layer.equation === 'string'
            && isStudioMode(layer.mode)
            && typeof layer.color === 'string'
          )).map((layer) => ({ ...layer, visible: layer.visible !== false }));
          if (restoredLayers.length > 0) setLayers(restoredLayers);
        }
        if (typeof saved.activeLayerId === 'number') setActiveLayerId(saved.activeLayerId);
        if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'neon') setTheme(saved.theme);
        if (typeof saved.playing === 'boolean') setPlaying(saved.playing);
        if (typeof saved.progress === 'number') setProgress(Math.min(1, Math.max(0, saved.progress)));
        if (typeof saved.autoRange === 'boolean') setAutoRange(saved.autoRange);
        setManualXMin(finiteNumber(saved.manualXMin, -10));
        setManualXMax(finiteNumber(saved.manualXMax, 10));
        setManualTMin(finiteNumber(saved.manualTMin, 0));
        setManualTMax(finiteNumber(saved.manualTMax, 2 * Math.PI));
        setSpeed(finiteNumber(saved.speed, 1));
        setDuration(finiteNumber(saved.duration, 8));
        setLineWidth(finiteNumber(saved.lineWidth, 2));
        if (typeof saved.color === 'string') setColor(saved.color);
        if (typeof saved.showGrid === 'boolean') setShowGrid(saved.showGrid);
        setGridDensity(finiteNumber(saved.gridDensity, 1));
        if (typeof saved.showAxes === 'boolean') setShowAxes(saved.showAxes);
        if (typeof saved.showTrail === 'boolean') setShowTrail(saved.showTrail);
        if (saved.pointStyle === 'line' || saved.pointStyle === 'particles') setPointStyle(saved.pointStyle);
        if (typeof saved.originView === 'boolean') setOriginView(saved.originView);
        if (typeof saved.showFps === 'boolean') setShowFps(saved.showFps);
        if (typeof saved.showWatermark === 'boolean') setShowWatermark(saved.showWatermark);
        if (typeof saved.watermark === 'string') setWatermark(saved.watermark);
        if (typeof saved.filename === 'string') setFilename(saved.filename);
        if (saved.fps === 30 || saved.fps === 60) setFps(saved.fps);
        setPageZoom(clampPageZoom(finiteNumber(saved.pageZoom, 1)));
        setGraphZoom(Math.min(2.5, Math.max(0.5, finiteNumber(saved.graphZoom, 1))));
        if (Array.isArray(saved.history)) setHistory(saved.history.slice(0, 8));
      }
      try {
        localStorage.removeItem('second-solution-theme');
        localStorage.removeItem('second-solution-history');
      } catch {
        // Legacy values are best-effort migration inputs only.
      }
      skipNextSceneResetRef.current = true;
      setSessionReady(true);
    });

    return () => { cancelled = true; };
  }, [launchParams]);
  const updateActiveLayer = useCallback((patch: Partial<EquationLayer>) => {
    setLayers((current) => current.map((layer) => layer.id === activeLayerId ? { ...layer, ...patch } : layer));
  }, [activeLayerId]);
  useEffect(() => {
    updateActiveLayer({ equation: renderEquation, mode: resolvedMode });
  }, [renderEquation, resolvedMode, updateActiveLayer]);
  const changeEquation = useCallback((value: string) => {
    setEquation(value);
    updateActiveLayer({ equation: value });
    const currentIndex = editHistoryIndexRef.current;
    const current = editHistoryRef.current;
    if (current[currentIndex] === value) return;
    const next = [...current.slice(0, currentIndex + 1), value].slice(-50);
    const nextIndex = next.length - 1;
    editHistoryRef.current = next;
    editHistoryIndexRef.current = nextIndex;
    setEditHistory(next);
    setEditHistoryIndex(nextIndex);
  }, [updateActiveLayer]);
  const changeMode = useCallback((value: StudioMode) => {
    setMode(value);
    updateActiveLayer({ mode: value === 'auto' ? detectSmartMode(equation) : value });
  }, [equation, updateActiveLayer]);
  const applyEditHistory = useCallback((nextIndex: number) => {
    const nextEquation = editHistoryRef.current[nextIndex];
    if (nextEquation === undefined) return;
    editHistoryIndexRef.current = nextIndex;
    setEditHistoryIndex(nextIndex);
    setEquation(nextEquation);
    updateActiveLayer({ equation: nextEquation, mode: mode === 'auto' ? detectSmartMode(nextEquation) : mode });
  }, [mode, updateActiveLayer]);
  const undoEquationEdit = useCallback(() => {
    if (editHistoryIndex > 0) applyEditHistory(editHistoryIndex - 1);
  }, [applyEditHistory, editHistoryIndex]);
  const redoEquationEdit = useCallback(() => {
    if (editHistoryIndexRef.current < editHistoryRef.current.length - 1) {
      applyEditHistory(editHistoryIndexRef.current + 1);
    }
  }, [applyEditHistory]);
  const changeColor = useCallback((value: string) => {
    setColor(value);
    updateActiveLayer({ color: value });
  }, [updateActiveLayer]);
  const smartRange = useMemo(() => detectSmartRange(renderEquation, resolvedMode), [renderEquation, resolvedMode]);
  const inputExpressions = useMemo(() => splitEquationExpressions(renderEquation, resolvedMode), [renderEquation, resolvedMode]);
  const renderExpressions = useMemo(() => {
    return inputExpressions.flatMap((expression, index) => (
      buildGraphEvaluator(expression, resolvedMode)
        ? [{
            expression,
            color: inputExpressions.length > 1
              ? multiGraphColors[index % multiGraphColors.length]
              : color,
          }]
        : []
    ));
  }, [color, inputExpressions, resolvedMode]);
  const skippedExpressionCount = Math.max(0, inputExpressions.length - renderExpressions.length);
  const activeRange = useMemo<GraphRange>(() => {
    if (autoRange) return smartRange;
    return {
      xMin: Math.min(manualXMin, manualXMax - 0.001),
      xMax: Math.max(manualXMax, manualXMin + 0.001),
      tMin: Math.min(manualTMin, manualTMax - 0.001),
      tMax: Math.max(manualTMax, manualTMin + 0.001),
    };
  }, [autoRange, manualTMax, manualTMin, manualXMax, manualXMin, smartRange]);
  const audioEvaluator = useMemo(
    () => parserBuildGraphEvaluator(renderEquation, resolvedMode),
    [renderEquation, resolvedMode],
  );
  const ensureAudioEngine = useCallback(async () => {
    if (audioEngineRef.current) {
      if (audioEngineRef.current.context.state === 'suspended') {
        await audioEngineRef.current.context.resume();
      }
      return audioEngineRef.current;
    }
    const AudioContextConstructor = getAudioContextConstructor();
    if (!AudioContextConstructor) return null;
    try {
      const context = new AudioContextConstructor();
      const master = context.createGain();
      const destination = context.createMediaStreamDestination();
      master.gain.value = audioEnabled ? 0.72 : 0;
      master.connect(context.destination);
      master.connect(destination);
      await context.resume();
      const engine = { context, master, destination };
      audioEngineRef.current = engine;
      return engine;
    } catch {
      return null;
    }
  }, [audioEnabled]);
  const audioYValue = useCallback((currentProgress: number) => {
    if (!audioEvaluator) return 0;
    const phase = currentProgress * Math.PI * 2 * speed;
    const x = activeRange.xMin + currentProgress * (activeRange.xMax - activeRange.xMin);
    const parameter = activeRange.tMin + currentProgress * (activeRange.tMax - activeRange.tMin);
    const scope = {
      x,
      y: 0,
      z: 0,
      t: parameter,
      u: parameter,
      theta: parameter,
      v: phase,
      r: phase,
      phi: phase,
      a: phase,
      b: speed,
    };
    try {
      if (audioEvaluator.kind === 'function') return Number(audioEvaluator.expression.evaluate(scope)) || 0;
      if (audioEvaluator.kind === 'parametric') return Number(audioEvaluator.y.evaluate(scope)) || 0;
      if (audioEvaluator.kind === 'polar') {
        const radius = Number(audioEvaluator.expression.evaluate(scope)) || 0;
        return radius * Math.sin(parameter);
      }
      if (audioEvaluator.kind === 'vector') return Number(audioEvaluator.y.evaluate(scope)) || 0;
      if (audioEvaluator.kind === 'points') {
        const points = evaluatePointSet(audioEvaluator.points, phase, speed);
        return points[Math.min(points.length - 1, Math.floor(currentProgress * points.length))]?.y ?? 0;
      }
    } catch {
      return 0;
    }
    return 0;
  }, [activeRange, audioEvaluator, speed]);

  useEffect(() => {
    if (!audioEnabled || !playing || !audioEngineRef.current) return;
    const engine = audioEngineRef.current;
    const currentProgress = progressRef.current;
    if (currentProgress === audioLastProgressRef.current) return;
    const y = audioYValue(currentProgress);
    if (!Number.isFinite(y)) return;
    const previousY = audioLastYRef.current;
    const direction = previousY === null ? 0 : Math.sign(y - previousY);
    const now = engine.context.currentTime;
    const minInterval = Math.max(0.075, 0.18 / Math.max(0.25, speed));
    if (now - audioLastBeatTimeRef.current > minInterval) {
      const normalizedY = Math.max(0, Math.min(1, (y + 4) / 8));
      scheduleAudioTone(engine, AUDIO_MIN_HZ + normalizedY * (AUDIO_MAX_HZ - AUDIO_MIN_HZ));
      const changedDirection = direction !== 0 && audioLastDirectionRef.current !== 0 && direction !== audioLastDirectionRef.current;
      const fixedBeat = currentProgress > 0 && Math.floor(currentProgress * 16) !== Math.floor(audioLastProgressRef.current * 16);
      if (changedDirection || fixedBeat) {
        scheduleAudioBeat(engine, changedDirection ? 1.25 : 0.72);
        audioLastBeatTimeRef.current = now;
      }
      audioLastDirectionRef.current = direction;
    }
    audioLastYRef.current = y;
    audioLastProgressRef.current = currentProgress;
  }, [audioEnabled, audioYValue, playing, progress, speed]);

  useEffect(() => () => {
    audioEngineRef.current?.context.close();
    audioEngineRef.current = null;
  }, []);
  const canvasEntries = useMemo(() => {
    const entries = layers
      .filter((layer) => layer.visible)
      .flatMap((layer) => {
      if (layer.id === activeLayerId) {
        return renderExpressions.map((entry) => ({
          ...entry,
           mode: resolvedMode,
          range: activeRange,
        }));
      }
      if (!buildGraphEvaluator(layer.equation, layer.mode)) return [];
      return [{
        expression: layer.equation,
        color: layer.color,
        mode: layer.mode,
        range: detectSmartRange(layer.equation, layer.mode),
      }];
      });
    return entries.map((entry, index) => ({
      ...entry,
      color: entries.length > 1 ? multiGraphColors[index % multiGraphColors.length] : entry.color,
    }));
  }, [activeLayerId, activeRange, layers, resolvedMode, renderExpressions]);
  useEffect(() => {
    if (skippedExpressionCount === 0) {
      setParserWarning('');
      return;
    }
    const warning = `${skippedExpressionCount} expression${skippedExpressionCount === 1 ? '' : 's'} skipped; valid lines are still rendering.`;
    setParserWarning(warning);
    const timer = window.setTimeout(() => setParserWarning(''), 6500);
    return () => window.clearTimeout(timer);
  }, [equation, mode, skippedExpressionCount]);
  const handleRenderStart = useCallback(() => setRenderStarted(true), []);
  const handleRenderStatus = useCallback((status: 'ready' | 'error', message?: string) => {
    setRenderHealth(status);
    setRenderHealthMessage(message || '');
  }, []);
  const handleRuntimeWarning = useCallback((message: string) => {
    setRuntimeWarning(message);
  }, []);
  useEffect(() => {
    setRuntimeWarning('');
    setRenderHealth('checking');
    setRenderHealthMessage('');
  }, [equation, mode, resolvedMode]);

  useEffect(() => {
    document.title = 'Second Solution Studio — Visualize Mathematics Like Never Before';
  }, []);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    if (!sessionReady) return;
    if (skipNextSceneResetRef.current) {
      skipNextSceneResetRef.current = false;
      return;
    }
    setRenderStarted(false);
    setRenderHealth('checking');
    setRenderHealthMessage('');
    setProgress(0);
    setPlaying(true);
    setOriginView(false);
  }, [equation, mode, sessionReady]);

  useEffect(() => {
    if (!sessionReady || !playing || captureActiveRef.current) return;
    let frame = 0;
    const startedAt = performance.now() - progressRef.current * duration * 1000;
    const tick = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / (duration * 1000));
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, playing, sessionReady]);

  useEffect(() => {
    if (serverResult?.valid && renderEquation.trim()) {
      const key = `${resolvedMode}:${renderEquation.trim()}`;
      if (key !== lastHistoryKey.current) {
        lastHistoryKey.current = key;
        setHistory((current) => {
            const next = [{ equation: renderEquation.trim(), mode: resolvedMode, at: Date.now(), preview: makeHistoryPreview(renderEquation.trim(), resolvedMode, color) }, ...current.filter((item) => `${item.mode}:${item.equation}` !== key)].slice(0, 8);
          return next;
        });
      }
    }
  }, [color, mode, renderEquation, resolvedMode, serverResult]);

  useEffect(() => {
    if (!sessionReady) return;
    const snapshot: StudioSessionState = {
      equation,
      mode,
      layers,
      activeLayerId,
      theme,
      playing,
      progress,
      autoRange,
      manualXMin,
      manualXMax,
      manualTMin,
      manualTMax,
      speed,
      duration,
      lineWidth,
      color,
      showGrid,
      gridDensity,
      showAxes,
      showTrail,
      pointStyle,
      originView,
      showFps,
      showWatermark,
      watermark,
      filename,
      fps,
      pageZoom,
      graphZoom,
      history,
    };
    sessionSnapshotRef.current = snapshot;
    if (sessionSaveTimerRef.current !== null) return;
    sessionSaveTimerRef.current = window.setTimeout(() => {
      sessionSaveTimerRef.current = null;
      const pendingSnapshot = sessionSnapshotRef.current;
      if (pendingSnapshot) void saveEncryptedJson(SESSION_STORAGE_KEY, pendingSnapshot);
    }, 350);
  }, [
    activeLayerId, autoRange, color, duration, equation, filename, fps, graphZoom,
    gridDensity, history, layers, lineWidth, manualTMax, manualTMin, manualXMax,
    manualXMin, mode, originView, pageZoom, playing, pointStyle, progress,
    sessionReady, showAxes, showFps, showGrid, showTrail, showWatermark, speed,
    theme, watermark,
  ]);

  useEffect(() => {
    if (!sessionReady) return;
    const message = 'Are you sure you want to reload? Your current equation state and unsaved animations will be lost.';
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (allowUnloadRef.current) return;
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [sessionReady]);

  const displayTime = (progress * duration).toFixed(1).padStart(4, '0');
  const resetScene = () => {
    setProgress(0);
    setPlaying(true);
  };
  const resetViewToOrigin = () => {
    setOriginView(true);
    setGraphZoom(1);
    setAutoRange(false);
    setManualXMin(-10);
    setManualXMax(10);
    setManualTMin(0);
    setManualTMax(2 * Math.PI);
    setTopNotice('Viewport centered on origin');
  };
  const cycleTheme = () => {
    const themes: StudioTheme[] = ['dark', 'neon', 'light'];
    const nextTheme = themes[(themes.indexOf(theme) + 1) % themes.length];
    setTheme(nextTheme);
    setTopNotice(`${nextTheme === 'light' ? 'Minimal Light' : nextTheme === 'neon' ? 'Neon Glow' : 'Dark'} theme`);
  };
  const togglePlayback = () => {
    if (!playing || progress >= 1) void ensureAudioEngine();
    if (progress >= 1) {
      setProgress(0);
      setPlaying(true);
      return;
    }
    setPlaying((value) => !value);
  };
  const toggleAudio = () => {
    const nextEnabled = !audioEnabled;
    setAudioEnabled(nextEnabled);
    const engine = audioEngineRef.current;
    if (engine) {
      engine.master.gain.setTargetAtTime(nextEnabled ? 0.72 : 0, engine.context.currentTime, 0.025);
      if (nextEnabled && engine.context.state === 'suspended') void engine.context.resume();
    } else if (nextEnabled) {
      void ensureAudioEngine();
    }
    setTopNotice(nextEnabled ? 'Audio synthesis enabled' : 'Audio synthesis muted');
  };
  const zoomPage = (delta: number) => {
    setPageZoom((value) => clampPageZoom(value + delta));
  };
  const zoomGraph = (delta: number) => {
    setGraphZoom((value) => Math.min(2.5, Math.max(0.5, Number((value + delta).toFixed(2)))));
  };
  const hardResetSession = () => {
    allowUnloadRef.current = true;
    clearStoredSession(SESSION_STORAGE_KEY);
    window.location.assign(`${import.meta.env.BASE_URL}studio`);
  };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEquationEdit(); else undoEquationEdit();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoEquationEdit();
        return;
      }
      if (isTyping) return;
      if (event.key === 'Escape') {
        setShowGraphMaker(false);
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      }
      if (event.key.toLowerCase() === 'r') {
        setProgress(0);
        setPlaying(true);
      }
      if (event.key.toLowerCase() === 'g') {
        setShowGrid((value) => !value);
        setTopNotice('Grid visibility toggled');
      }
      if (event.key.toLowerCase() === 'e') {
        downloadPngRef.current();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [progress, redoEquationEdit, undoEquationEdit]);
  const applyPreset = (preset: (typeof presets)[number]) => {
    changeEquation(preset.equation);
    changeMode(preset.mode);
    setProgress(0);
    setPlaying(true);
  };
  const selectLayer = (layer: EquationLayer) => {
    setActiveLayerId(layer.id);
    setEquation(layer.equation);
    setMode(layer.mode);
    setColor(layer.color);
    setOriginView(false);
  };
  const addLayer = () => {
    const id = Math.max(...layers.map((layer) => layer.id), 0) + 1;
    const nextLayer: EquationLayer = {
      id,
      equation: 'cos(x - t) * 0.65',
      mode: 'function',
      color: layerColors[(id - 1) % layerColors.length],
      visible: true,
    };
    setLayers((current) => [...current, nextLayer]);
    selectLayer(nextLayer);
    setProgress(0);
    setPlaying(true);
  };
  const removeLayer = (id: number) => {
    if (layers.length === 1) return;
    const remaining = layers.filter((layer) => layer.id !== id);
    setLayers(remaining);
    if (id === activeLayerId) selectLayer(remaining[0]);
  };
  const toggleLayer = (id: number) => {
    setLayers((current) => current.map((layer) => layer.id === id ? { ...layer, visible: !layer.visible } : layer));
  };
  const removeHistory = (index: number) => {
    setHistory((current) => {
      const next = current.filter((_, itemIndex) => itemIndex !== index);
      return next;
    });
  };
  const clearHistory = () => {
    try {
      localStorage.removeItem('second-solution-history');
      localStorage.removeItem('mae-history');
    } catch { /* local storage is optional */ }
    setHistory([]);
  };

  const downloadPng = () => {
    const canvases = [
      ...Array.from(canvasColumnRef.current?.querySelectorAll<HTMLCanvasElement>('canvas.webgl-canvas') ?? []),
      ...Array.from(canvasColumnRef.current?.querySelectorAll<HTMLCanvasElement>('canvas.graph-canvas') ?? []),
    ];
    const canvas = canvases[0];
    if (!canvas) return;
    if (!canvases.some(canvasHasNonEmptyPixels)) {
      setExportStatus('Wait for the local canvas pixel check to complete');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const context = exportCanvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#171a24';
    context.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    canvases.reverse().forEach((item) => context.drawImage(item, 0, 0, exportCanvas.width, exportCanvas.height));
    context.fillStyle = 'rgba(241, 236, 222, .72)';
    context.font = `${Math.max(12, exportCanvas.width / 75)}px DM Mono, monospace`;
    context.fillText(BRAND_WATERMARK, 24, exportCanvas.height - 24);
    if (showFps) {
      context.fillStyle = '#ffcf75';
      context.font = `${Math.max(11, exportCanvas.width / 88)}px DM Mono, monospace`;
      context.fillText(`${fps} FPS`, exportCanvas.width - 80, 28);
    }
    const link = document.createElement('a');
    link.download = `${filename.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || filenameFromEquation(renderEquation)}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
    setExportStatus('PNG frame saved');
    window.setTimeout(() => setExportStatus(''), 2500);
  };
  downloadPngRef.current = downloadPng;

  const captureWebm = async () => {
    if (captureActiveRef.current) return;
    const audioEngine = await ensureAudioEngine();
    if (!audioEngine) {
      setExportStatus('Audio capture is not supported in this browser');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    const sourceCanvases = Array.from(canvasColumnRef.current?.querySelectorAll<HTMLCanvasElement>('canvas.graph-canvas') ?? []);
    const webglCanvases = Array.from(canvasColumnRef.current?.querySelectorAll<HTMLCanvasElement>('canvas.webgl-canvas') ?? []);
    if (sourceCanvases.length === 0 || !('MediaRecorder' in window) || !HTMLCanvasElement.prototype.captureStream) {
      setExportStatus('HD video capture is not supported here');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    if (![...webglCanvases, ...sourceCanvases].some(canvasHasNonEmptyPixels)) {
      setExportStatus('Wait for the local canvas pixel check to complete');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    const exportFps = 60;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 1280;
    captureCanvas.height = 720;
    const captureContext = captureCanvas.getContext('2d');
    if (!captureContext) {
      setExportStatus('HD video capture is not supported here');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    const drawCaptureSource = (source: HTMLCanvasElement) => {
      const sourceAspect = source.width / Math.max(1, source.height);
      const targetAspect = captureCanvas.width / captureCanvas.height;
      const drawWidth = sourceAspect > targetAspect
        ? captureCanvas.width
        : captureCanvas.height * sourceAspect;
      const drawHeight = sourceAspect > targetAspect
        ? captureCanvas.width / sourceAspect
        : captureCanvas.height;
      captureContext.drawImage(
        source,
        (captureCanvas.width - drawWidth) / 2,
        (captureCanvas.height - drawHeight) / 2,
        drawWidth,
        drawHeight,
      );
    };
    const paintCaptureFrame = () => {
      captureContext.fillStyle = '#171a24';
      captureContext.fillRect(0, 0, captureCanvas.width, captureCanvas.height);
      webglCanvases.slice().reverse().forEach(drawCaptureSource);
      sourceCanvases.slice().reverse().forEach(drawCaptureSource);
      captureContext.fillStyle = 'rgba(241, 236, 222, .78)';
      captureContext.font = '16px DM Mono, monospace';
      captureContext.textAlign = 'right';
      captureContext.fillText(watermark || BRAND_WATERMARK, captureCanvas.width - 28, captureCanvas.height - 26);
      if (showFps) {
        captureContext.fillStyle = '#ffcf75';
        captureContext.font = '14px DM Mono, monospace';
        captureContext.fillText(`${fps} FPS`, captureCanvas.width - 28, 30);
      }
      captureContext.textAlign = 'start';
    };
    paintCaptureFrame();
    const videoStream = captureCanvas.captureStream(exportFps);
    const audioTrack = audioEngine.destination.stream.getAudioTracks()[0]?.clone();
    if (!audioTrack) {
      videoStream.getTracks().forEach((track) => track.stop());
      setExportStatus('Audio capture is not supported in this browser');
      window.setTimeout(() => setExportStatus(''), 3000);
      return;
    }
    const stream = new MediaStream([
      ...videoStream.getVideoTracks(),
      audioTrack,
    ]);
    const videoTrack = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
    const mimeType = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setExportStatus('HD video capture is not supported here');
      return;
    }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch {
        setExportStatus('HD video capture is not supported here');
        window.setTimeout(() => setExportStatus(''), 3000);
        return;
      }
    }
    const previousProgress = progressRef.current;
    const previousPlaying = playing;
    captureActiveRef.current = true;
    setPlaying(true);
    setExportStatus('Capturing live canvas at 60 FPS…');
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => {
      if (captureRafRef.current !== null) {
        cancelAnimationFrame(captureRafRef.current);
        captureRafRef.current = null;
      }
      if (captureStopTimerRef.current !== null) {
        window.clearTimeout(captureStopTimerRef.current);
        captureStopTimerRef.current = null;
      }
      captureActiveRef.current = false;
      progressRef.current = previousProgress;
      setProgress(previousProgress);
      setPlaying(previousPlaying);
      stream.getTracks().forEach((track) => track.stop());
       captureContext.clearRect(0, 0, captureCanvas.width, captureCanvas.height);
      const isMp4 = mimeType.includes('mp4');
      const extension = isMp4 ? 'mp4' : 'webm';
      const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      const link = document.createElement('a');
      link.download = `${filename.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || filenameFromEquation(renderEquation)}.${extension}`;
      link.href = url;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus(`${isMp4 ? 'MP4' : 'WebM'} HD scene saved`);
      window.setTimeout(() => setExportStatus(''), 2500);
    };
    const startedAt = performance.now();
    const captureFrame = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / (duration * 1000));
      progressRef.current = nextProgress;
      setProgress(nextProgress);
      // requestFrame is supported by manual canvas streams in Chromium. With a
      // 60 FPS stream it is harmless elsewhere and makes keyframes explicit.
      window.requestAnimationFrame(() => {
        paintCaptureFrame();
        videoTrack?.requestFrame?.();
        if (nextProgress >= 1) {
          captureStopTimerRef.current = window.setTimeout(() => {
            if (recorder.state !== 'inactive') recorder.stop();
          }, 50);
        } else {
          captureRafRef.current = requestAnimationFrame(captureFrame);
        }
      });
    };
    recorder.start(250);
    progressRef.current = 0;
    setProgress(0);
    captureRafRef.current = requestAnimationFrame(captureFrame);
  };

  const validatorState = validation.isPending
    ? { label: 'Validating locally', className: 'state-pending' }
    : { label: 'Validator active', className: serverResult?.valid === false ? 'state-error' : 'state-valid' };
  const autocompleteOptions = ['sin(', 'cos(', 'tan(', 'log(', 'sqrt('];
  const autocompleteSuggestions = autocompleteOptions.filter((item) => !equation.toLowerCase().includes(item.slice(0, -1))).slice(0, 5);
  const usingSafeFallback = Boolean(renderEquation.trim() && (validation.isError || (serverResult && !serverResult.valid)));
  const recoverWithFallback = () => {
    changeEquation('sin(x + t) * exp(-0.08 * x^2)');
    changeMode('function');
    setTopNotice('Safe wave fallback loaded');
    setPlaying(true);
  };
  const insertSuggestion = (suggestion: string) => {
    const input = equationInputRef.current;
    const cursor = input?.selectionStart ?? equation.length;
    const next = `${equation.slice(0, cursor)}${suggestion}${equation.slice(input?.selectionEnd ?? cursor)}`;
    changeEquation(next);
    window.requestAnimationFrame(() => {
      input?.focus();
      const nextCursor = cursor + suggestion.length;
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
      <div className={`studio-app theme-${theme}`} style={{ '--page-zoom': pageZoom } as CSSProperties}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><AppIcon /></div>
          <div>
            <div className="brand-title-row">
              <div className="brand-name">Second Solution Studio</div>
              <span className="version-badge">v1.0.1 - Live</span>
            </div>
            <div className="brand-sub mono">studio / scene 01</div>
            <div className="tagline">Visualize Mathematics Like Never Before</div>
          </div>
        </div>
        <div className="topbar-center">
          <span className="live-dot" />
          <span className="mono">LIVE RENDER</span>
          <span className="muted">·</span>
          <span>{topNotice || 'Canvas / CPU adaptive'}</span>
        </div>
        <div className="top-actions">
          <span className="shortcut">SPACE · R · E · G</span>
            <button className="graph-maker-btn" type="button" onClick={() => setShowGraphMaker(true)} data-testid="button-graph-maker" aria-label="Open Graph Maker">
              <Waves className="icon" /> Graph Maker
            </button>
           <button className="icon-btn theme-cycle-btn" type="button" onClick={cycleTheme} data-testid="button-cycle-theme" aria-label={`Switch theme, currently ${theme}`} title={`Theme: ${theme}`}><Palette className="icon" /></button>
          <div className="zoom-control" aria-label="Page zoom controls">
            <button className="icon-btn" type="button" onClick={() => zoomPage(-0.1)} data-testid="button-page-zoom-out" aria-label="Zoom page out"><Minus className="icon" /></button>
             <input
               className="page-zoom-range"
               type="range"
               min="90"
               max="200"
               step="10"
               value={Math.round(pageZoom * 100)}
               onChange={(event) => setPageZoom(clampPageZoom(Number(event.target.value) / 100))}
               aria-label="Page zoom from 90% to 200%"
               data-testid="input-page-zoom"
             />
            <span className="zoom-value mono">{Math.round(pageZoom * 100)}%</span>
            <button className="icon-btn" type="button" onClick={() => zoomPage(0.1)} data-testid="button-page-zoom-in" aria-label="Zoom page in"><Plus className="icon" /></button>
          </div>
          <button className="icon-btn" type="button" onClick={() => setTopNotice('Inspector controls are live on the right')} data-testid="button-settings" aria-label="Open studio settings"><Settings2 className="icon" /></button>
        </div>
      </header>
      {(runtimeWarning || parserWarning) && <div className="parser-toast" role="status"><span className="status-dot" /> {runtimeWarning || parserWarning}</div>}

        {showGraphMaker && (
          <div className="graph-maker-modal" role="dialog" aria-modal="true" aria-labelledby="graph-maker-title">
            <div className="graph-maker-panel">
              <div className="graph-maker-header">
                <div>
                  <p className="eyebrow">external studio</p>
                  <h2 id="graph-maker-title">Graph Maker</h2>
                </div>
                <button className="icon-btn graph-maker-close" type="button" onClick={() => setShowGraphMaker(false)} data-testid="button-close-graph-maker" aria-label="Close Graph Maker">
                  <X className="icon" />
                </button>
              </div>
              <div className="graph-maker-frame-wrap">
                <iframe
                  className="graph-maker-frame"
                  src="https://www.desmos.com/calculator?lang=en"
                  title="Desmos Graphing Calculator"
                  allow="fullscreen"
                />
              </div>
              <div className="graph-maker-footer">
                <span>Interactive graphing powered by Desmos.</span>
                <a href="https://www.desmos.com/calculator" target="_blank" rel="noreferrer">Open full calculator <span aria-hidden="true">↗</span></a>
              </div>
            </div>
          </div>
        )}

      <main className="studio-layout">
        <aside className="left-panel">
          <section className="panel-section">
            <div className="panel-heading">
             <h2>{resolvedMode === 'points' ? 'Point set' : 'Equation cue'}</h2>
              <span className="eyebrow">input 01</span>
            </div>
            <div className="equation-box">
              <textarea
                ref={equationInputRef}
                 className={`equation-input ${resolvedMode === 'points' ? 'points-input' : ''}`}
                value={equation}
                onChange={(event) => changeEquation(event.target.value)}
                placeholder={details.placeholder}
                 rows={resolvedMode === 'points' ? 6 : undefined}
                spellCheck={false}
                 data-testid={resolvedMode === 'points' ? 'input-points' : 'input-equation'}
                 aria-label={resolvedMode === 'points' ? 'Point set input' : 'Equation input'}
              />
              <div className="input-footer">
                 <div className="input-edit-tools">
                   <span className="input-hint mono">{resolvedMode === 'points' ? 'One (x, y) pair per line' : mode === 'auto' ? `Detected as ${modeDetails[resolvedMode].title} · use t for time` : 'Use t for time'}</span>
                   <div className="edit-history-buttons" aria-label="Equation edit history">
                     <button className="icon-btn" type="button" onClick={undoEquationEdit} disabled={editHistoryIndex === 0} aria-label="Undo equation edit" title="Undo (Ctrl/Cmd+Z)"><Undo2 className="icon" /></button>
                     <button className="icon-btn" type="button" onClick={redoEquationEdit} disabled={editHistoryIndex >= editHistory.length - 1} aria-label="Redo equation edit" title="Redo (Ctrl/Cmd+Y)"><Redo2 className="icon" /></button>
                   </div>
                 </div>
                <span className={`validate-state ${validatorState.className}`} data-testid="status-validation">
                  <span className="state-dot" /> {validatorState.label}
                </span>
              </div>
               {resolvedMode !== 'points' && autocompleteSuggestions.length > 0 && (
                <div className="autocomplete-row">
                  <span className="autocomplete-label">Function palette</span>
                  {autocompleteSuggestions.map((suggestion) => (
                    <button className="autocomplete-chip" type="button" key={suggestion} onClick={() => insertSuggestion(suggestion)}>{suggestion}</button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="panel-section">
            <div className="panel-heading">
              <h2>Interpret as</h2>
              <span className="eyebrow">mode</span>
            </div>
            <select
              className="mode-select"
              value={mode}
              onChange={(event) => changeMode(event.target.value as StudioMode)}
              data-testid="select-mode"
              aria-label="Equation mode"
            >
              {(Object.keys(modeDetails) as StudioMode[]).map((item) => (
                <option key={item} value={item}>{modeDetails[item].title} · {modeDetails[item].helper}</option>
              ))}
            </select>
          </section>

           <section className="panel-section">
             <div className="panel-heading">
               <h2>Visible layers</h2>
               <span className="eyebrow">{layers.filter((layer) => layer.visible).length} on</span>
             </div>
             <div className="layer-list">
               {layers.map((layer, index) => (
                 <div className={`layer-card ${layer.id === activeLayerId ? 'active' : ''}`} key={layer.id}>
                   <span className="layer-swatch" style={{ '--layer-color': layer.color } as CSSProperties} />
                   <button className="layer-select" type="button" onClick={() => selectLayer(layer)} data-testid={`button-select-layer-${index}`}>
                     <span className="layer-name">{layer.equation || 'Untitled layer'}</span>
                     <span className="layer-meta mono">{smartPatternLabel(layer.equation, layer.mode)} · {layer.mode}</span>
                   </button>
                   <div className="layer-actions">
                     <button className={`layer-toggle ${layer.visible ? 'on' : ''}`} type="button" onClick={() => toggleLayer(layer.id)} aria-label={`${layer.visible ? 'Hide' : 'Show'} layer ${index + 1}`} aria-pressed={layer.visible}>
                       {layer.visible ? <Eye className="icon" /> : <EyeOff className="icon" />}
                     </button>
                     {layers.length > 1 && <button className="icon-btn" type="button" onClick={() => removeLayer(layer.id)} aria-label={`Remove layer ${index + 1}`}><X className="icon" /></button>}
                   </div>
                 </div>
               ))}
             </div>
             <button className="add-layer-btn" type="button" onClick={addLayer} data-testid="button-add-layer"><Plus className="icon" /> Add equation layer</button>
           </section>

          <section className="panel-section">
            <div className="panel-heading">
              <h2>Start from a shape</h2>
              <span className="eyebrow">presets</span>
            </div>
            <div className="preset-grid">
              {presets.map((preset) => (
                <button className="preset-card" type="button" key={preset.label} onClick={() => applyPreset(preset)} data-testid={`button-preset-${preset.label.toLowerCase().replaceAll(' ', '-')}`}>
                  <span className="preset-symbol">{preset.symbol}</span>
                  <span className="preset-name">{preset.label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel-section">
            <div className="panel-heading">
               <button className="section-toggle" type="button" onClick={() => setHistoryOpen((value) => !value)} aria-expanded={historyOpen} aria-controls="equation-history-drawer">
                 <h2>Equation history</h2><span className="eyebrow">{historyOpen ? 'open' : 'closed'}</span>
               </button>
               <div className="panel-heading-actions">
                 {history.length > 0 && <button className="icon-btn" type="button" onClick={clearHistory} data-testid="button-clear-history" aria-label="Clear equation history"><Trash2 className="icon" /></button>}
               </div>
            </div>
             {historyOpen && (history.length > 0 ? (
              <div className="history-list">
                {history.map((item, index) => (
                  <div className="history-row" key={`${item.mode}-${item.equation}-${item.at}`}>
                     <img className="history-thumb" src={item.preview || makeHistoryPreview(item.equation, item.mode)} alt="" />
                     <button className="history-load" type="button" onClick={() => { changeEquation(item.equation); changeMode(item.mode); }} data-testid={`button-history-${index}`}>
                      <span className="history-equation">{item.equation}</span>
                      <span className="history-meta mono">{item.mode} · {new Date(item.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </button>
                    <button className="icon-btn" type="button" onClick={() => removeHistory(index)} data-testid={`button-delete-history-${index}`} aria-label={`Remove history item ${index + 1}`}><X className="icon" /></button>
                  </div>
                ))}
              </div>
             ) : <div className="empty-history" id="equation-history-drawer">Validated cues will stay here for quick returns.</div>)}
          </section>
        </aside>

        <section className="canvas-column" ref={canvasColumnRef}>
          <div className="canvas-toolbar">
            <div className="scene-id">
              <span className="scene-index mono">01</span>
                <span className="scene-name">{smartPatternLabel(renderEquation, resolvedMode)} / {renderEquation || 'Untitled scene'}</span>
               <span className="scene-status mono">{renderHealth === 'ready' ? 'READY' : renderHealth === 'error' ? 'CHECK' : 'PREVIEW'}</span>
            </div>
            {canvasEntries.length > 0 && <div className="multi-legend" aria-label="Active line colors">
              {canvasEntries.map((entry, index) => <span className="multi-legend-item" key={`${entry.mode}-${entry.expression}-${index}`}><i style={{ backgroundColor: entry.color, boxShadow: `0 0 8px ${entry.color}` }} /> L{index + 1}</span>)}
            </div>}
            <div className="canvas-actions">
               <button className="dark-icon-btn" type="button" onClick={resetScene} data-testid="button-reset-scene" aria-label="Reset scene"><RotateCcw className="icon" /></button>
                <button className="dark-icon-btn" type="button" onClick={resetViewToOrigin} data-testid="button-reset-origin" aria-label="Reset viewport to origin">0</button>
                <button className="dark-icon-btn" type="button" onClick={() => zoomGraph(-0.25)} data-testid="button-graph-zoom-out" aria-label="Zoom graph out"><Minus className="icon" /></button>
                <span className="graph-zoom-value mono" aria-live="polite">{graphZoom.toFixed(2)}×</span>
                <button className="dark-icon-btn" type="button" onClick={() => zoomGraph(0.25)} data-testid="button-graph-zoom-in" aria-label="Zoom graph in"><Plus className="icon" /></button>
               <button className="dark-icon-btn" type="button" onClick={downloadPng} data-testid="button-export-png" aria-label="Export PNG"><Download className="icon" /></button>
            </div>
          </div>
          <div className="canvas-wrap">
             <div className="canvas-layer-stack">
                {canvasEntries.map((entry, index) => (
                  <GraphCanvas
                    key={`${entry.mode}-${entry.expression}-${index}`}
                    equation={entry.expression}
                    mode={entry.mode}
                    range={entry.range}
                    playing={playing}
                    progress={progress}
                    speed={speed}
                    showGrid={showGrid && index === 0}
                    gridDensity={gridDensity}
                    showAxes={showAxes && index === 0}
                    showTrail={showTrail}
                    lineWidth={lineWidth}
                    color={entry.color}
                    pointStyle={pointStyle}
                     graphZoom={graphZoom}
                    originView={originView}
                     cameraFrame={sharedCameraFrameRef.current}
                     cameraSource={index === 0}
                     animationExpected={animationExpected}
                    onRenderStart={handleRenderStart}
                     onRenderStatus={handleRenderStatus}
                    onRuntimeWarning={handleRuntimeWarning}
                  />
                ))}
              </div>
            <div className="canvas-overlay">
              <div className="scan-line" />
               <div className="canvas-watermark mono" aria-label="Permanent watermark">{BRAND_WATERMARK}</div>
              <div className="canvas-readout mono">
                  <div>MODE <strong>{resolvedMode.toUpperCase()}</strong> <span className="muted">· {smartPatternLabel(renderEquation, resolvedMode)}</span>{usingSafeFallback && <span className="fps-readout"> · SAFE</span>}</div>
                <div>FRAME <strong>{String(Math.round(progress * 240)).padStart(3, '0')}</strong> / 240</div>
                 {showFps && <div className="fps-readout">FPS <strong>{fps}</strong></div>}
                  <div>{resolvedMode === 'function' || resolvedMode === 'piecewise' ? 'X RANGE' : resolvedMode === 'parametric' ? 'T RANGE' : resolvedMode === 'polar' ? 'Θ RANGE' : 'DOMAIN'} <strong>{resolvedMode === 'function' || resolvedMode === 'piecewise' ? `${activeRange.xMin} … ${activeRange.xMax}` : resolvedMode === 'parametric' || resolvedMode === 'polar' ? `${activeRange.tMin.toFixed(2)} … ${activeRange.tMax.toFixed(2)}` : '−π … π'}</strong></div>
              </div>
                 <div className="canvas-legend"><span className="legend-line" /> {canvasEntries.length > 1 ? `${canvasEntries.length} active traces` : canvasEntries.length === 0 ? 'no active traces' : 'active trace'} <span className="muted">·</span> t = {displayTime}s</div>
                  <div className={`canvas-empty ${canvasEntries.length > 0 && (playing || progress >= 1) ? 'is-hidden' : ''}`} aria-hidden={canvasEntries.length > 0 && (playing || progress >= 1)}>
                  <div className="canvas-empty-card">
                       <h3>{canvasEntries.length === 0 ? 'No visible equations' : 'Scene paused at the cue'}</h3>
                     <p>
                        {canvasEntries.length === 0
                          ? 'Turn a layer back on to continue exploring the scene.'
                          : serverResult?.valid
                         ? serverResult.verificationMessage
                         : serverResult?.error || 'Try a simpler expression, then keep iterating.'}
                     </p>
                  </div>
               </div>
                 {renderHealth === 'error' && <div className="render-health-alert" role="alert"><strong>Render check</strong><span>{renderHealthMessage}</span></div>}
            </div>
          </div>
          <div className="transport">
             {progress >= 1 && renderHealth === 'ready' && <strong className="scene-complete-status" role="status">Scene complete.</strong>}
             <button className="play-btn" type="button" onClick={togglePlayback} data-testid="button-playback" aria-label={playing ? 'Pause animation' : 'Play animation'}>
              {playing ? <Pause className="icon" /> : <Play className="icon" />}
            </button>
            <span className="transport-time mono">{displayTime}s</span>
            <input className="timeline" type="range" min="0" max="1" step="0.001" value={progress} onChange={(event) => setProgress(Number(event.target.value))} data-testid="input-timeline" aria-label="Animation timeline" />
             <div className="transport-progress" role="progressbar" aria-label="Drawing progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${progress * 100}%` }} /></div>
             <span className="transport-percent mono">{Math.round(progress * 100)}%</span>
            <span className="transport-speed mono">{speed.toFixed(1)}×</span>
            <button
              className={`audio-toggle ${audioEnabled ? 'is-on' : ''}`}
              type="button"
              onClick={toggleAudio}
              aria-pressed={audioEnabled}
              aria-label={audioEnabled ? 'Mute audio synthesis' : 'Unmute audio synthesis'}
              title={audioEnabled ? 'Mute audio synthesis' : 'Unmute audio synthesis'}
              data-testid="button-audio-toggle"
            >
              {audioEnabled ? <Volume2 className="icon" /> : <VolumeX className="icon" />}
              <span>{audioEnabled ? 'Audio ON' : 'Audio muted'}</span>
            </button>
             <button className="transport-help" type="button" onClick={() => setShowGuide(true)} aria-label="Open math mode guide and troubleshooting" data-testid="button-open-guide">
               <CircleHelp className="icon" />
             </button>
          </div>
        </section>

        {showGuide && (
          <aside className="guide-drawer" aria-label="Math mode guide and troubleshooting">
            <div className="guide-drawer-header">
              <div><span className="landing-eyebrow">Studio guide</span><h2>Make the render make sense.</h2></div>
              <button className="icon-btn" type="button" onClick={() => setShowGuide(false)} aria-label="Close guide">×</button>
            </div>
            <div className="guide-drawer-content">
              <section className="guide-block">
                <h3>Mode guides</h3>
                <div className="guide-mode-grid">
                  {(Object.keys(modeDetails) as StudioMode[]).map((guideMode) => (
                    <button type="button" key={guideMode} className={mode === guideMode ? 'active' : ''} onClick={() => { changeMode(guideMode); setShowGuide(false); }}>
                      <strong>{modeDetails[guideMode].title}</strong><span>{modeDetails[guideMode].placeholder}</span>
                    </button>
                  ))}
                </div>
              </section>
              <section className="guide-block">
                <h3>If rendering freezes</h3>
                <ol>
                  <li>Pause and reset the scene with the circular-arrow control.</li>
                  <li>Try Auto Range or reset the viewport to origin.</li>
                  <li>Reduce point density by simplifying the expression or switch off Motion trail.</li>
                  <li>If WebGL is unavailable, the CPU canvas remains the source of truth.</li>
                </ol>
              </section>
              <section className="guide-reset-card">
                <div><strong>Hard Reset Session</strong><span>Clear encrypted local scene data and reopen the studio.</span></div>
                <button type="button" onClick={hardResetSession}>Reset safely</button>
              </section>
            </div>
          </aside>
        )}

        <aside className="right-panel">
           <section className="panel-section">
             <div className="panel-heading"><h2>Studio atmosphere</h2><Palette className="icon muted" /></div>
             <select className="theme-select" value={theme} onChange={(event) => setTheme(event.target.value as StudioTheme)} aria-label="Studio theme" data-testid="select-theme">
               <option value="light">Minimal Light</option>
               <option value="dark">Dark</option>
               <option value="neon">Neon Glow</option>
             </select>
             <p className="setting-desc">Affects the workspace, not the math.</p>
           </section>
          <section className="panel-section">
            <div className="panel-heading"><h2>Scene timing</h2><Gauge className="icon muted" /></div>
            <div className="control-row">
              <label className="control-label" htmlFor="duration">Duration <span className="control-value">{duration}s</span></label>
              <input id="duration" className="range-input" type="range" min="2" max="20" step="1" value={duration} onChange={(event) => setDuration(Number(event.target.value))} data-testid="input-duration" />
            </div>
            <div className="control-row">
              <label className="control-label" htmlFor="speed">Playback rate <span className="control-value">{speed.toFixed(1)}×</span></label>
              <input id="speed" className="range-input" type="range" min="0.25" max="2" step="0.25" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} data-testid="input-speed" />
            </div>
          </section>

          <section className="panel-section">
            <div className="panel-heading"><h2>Range &amp; framing</h2><span className="eyebrow">{autoRange ? 'smart' : 'manual'}</span></div>
            <div className="setting-row">
              <div className="setting-copy">Auto Range <span className="setting-desc">Fit the active scene automatically</span></div>
              <button className={`switch ${autoRange ? 'on' : ''}`} type="button" onClick={() => setAutoRange((value) => !value)} data-testid="button-toggle-auto-range" aria-label="Toggle automatic range" aria-pressed={autoRange} />
            </div>
            {autoRange ? (
              <div className="range-summary mono">
                 {(resolvedMode === 'function' || resolvedMode === 'piecewise') && <>x: {smartRange.xMin} → {smartRange.xMax}</>}
                {(resolvedMode === 'parametric' || resolvedMode === 'polar') && <>{resolvedMode === 'polar' ? 'θ' : 't'}: {smartRange.tMin.toFixed(2)} → {smartRange.tMax.toFixed(2)}</>}
                {resolvedMode === 'points' && <>Sequential: first → last point</>}
                {resolvedMode === 'implicit3d' ? <>Adaptive 3D mesh viewport</> : resolvedMode === 'implicit' ? <>Adaptive contour viewport</> : null}
                 {resolvedMode === 'vector' && <>Adaptive direction-field viewport</>}
              </div>
             ) : resolvedMode === 'points' || resolvedMode === 'implicit' || resolvedMode === 'implicit3d' || resolvedMode === 'vector' ? (
               <div className="range-summary">Manual range is not needed for {resolvedMode} scenes.</div>
            ) : (
              <div className="range-fields">
                  <label> {resolvedMode === 'polar' ? 'θ min' : 'X min'} <input className="range-number" type="number" step="0.1" value={resolvedMode === 'polar' ? manualTMin : manualXMin} onChange={(event) => resolvedMode === 'polar' ? setManualTMin(Number(event.target.value)) : setManualXMin(Number(event.target.value))} data-testid={resolvedMode === 'polar' ? 'input-theta-min' : 'input-x-min'} /></label>
                  <label> {resolvedMode === 'polar' ? 'θ max' : 'X max'} <input className="range-number" type="number" step="0.1" value={resolvedMode === 'polar' ? manualTMax : manualXMax} onChange={(event) => resolvedMode === 'polar' ? setManualTMax(Number(event.target.value)) : setManualXMax(Number(event.target.value))} data-testid={resolvedMode === 'polar' ? 'input-theta-max' : 'input-x-max'} /></label>
                  {resolvedMode !== 'polar' && <label> T min <input className="range-number" type="number" step="0.1" value={manualTMin} onChange={(event) => setManualTMin(Number(event.target.value))} data-testid="input-t-min" /></label>}
                  {resolvedMode !== 'polar' && <label> T max <input className="range-number" type="number" step="0.1" value={manualTMax} onChange={(event) => setManualTMax(Number(event.target.value))} data-testid="input-t-max" /></label>}
              </div>
            )}
          </section>

          <section className="panel-section">
            <div className="panel-heading"><h2>Trace treatment</h2><Waves className="icon muted" /></div>
            <div className="control-row">
              <label className="control-label" htmlFor="line-width">Line weight <span className="control-value">{lineWidth}px</span></label>
              <input id="line-width" className="range-input" type="range" min="1" max="5" step="0.5" value={lineWidth} onChange={(event) => setLineWidth(Number(event.target.value))} data-testid="input-line-width" />
            </div>
            <div className="control-row swatch-row">
              <label className="control-label" htmlFor="trace-color">Trace color <span className="control-value">{color}</span></label>
               <input id="trace-color" className="color-input" type="color" value={color} onChange={(event) => changeColor(event.target.value)} data-testid="input-trace-color" />
            </div>
             {resolvedMode === 'points' && (
              <div className="control-row">
                <label className="control-label" htmlFor="point-style">Point render</label>
                <select id="point-style" className="select-control" value={pointStyle} onChange={(event) => setPointStyle(event.target.value as 'line' | 'particles')} data-testid="select-point-style">
                  <option value="line">Connected line</option>
                  <option value="particles">Particles</option>
                </select>
              </div>
            )}
            <div className="setting-row">
              <div className="setting-copy">Grid <span className="setting-desc">Coordinate scaffolding</span></div>
              <button className={`switch ${showGrid ? 'on' : ''}`} type="button" onClick={() => setShowGrid((value) => !value)} data-testid="button-toggle-grid" aria-label="Toggle grid" aria-pressed={showGrid} />
            </div>
             <div className="control-row">
               <label className="control-label" htmlFor="grid-density">Grid density <span className="control-value">{gridDensity.toFixed(1)}×</span></label>
               <input id="grid-density" className="range-input" type="range" min="0.5" max="2" step="0.25" value={gridDensity} onChange={(event) => setGridDensity(Number(event.target.value))} data-testid="input-grid-density" />
             </div>
            <div className="setting-row">
              <div className="setting-copy">Axes <span className="setting-desc">x / y references</span></div>
              <button className={`switch ${showAxes ? 'on' : ''}`} type="button" onClick={() => setShowAxes((value) => !value)} data-testid="button-toggle-axes" aria-label="Toggle axes" aria-pressed={showAxes} />
            </div>
            <div className="setting-row">
              <div className="setting-copy">Motion trail <span className="setting-desc">Echo previous frames</span></div>
              <button className={`switch ${showTrail ? 'on' : ''}`} type="button" onClick={() => setShowTrail((value) => !value)} data-testid="button-toggle-trail" aria-label="Toggle motion trail" aria-pressed={showTrail} />
            </div>
          </section>

          <section className="panel-section">
            <div className="panel-heading"><h2>Local validation</h2><Activity className="icon muted" /></div>
            {validation.isPending ? (
              <div className="server-result"><div className="result-title"><span className="status-dot state-pending" /> Validating locally</div><p className="result-copy">Checking structure and finding variables in your browser…</p></div>
            ) : serverResult ? (
              <div className={`server-result ${serverResult.valid ? 'valid' : 'invalid'}`} data-testid="status-server-result">
                <div className={`result-title ${serverResult.valid ? 'state-valid' : 'state-error'}`}><span className="status-dot" /> {serverResult.valid ? 'Expression accepted' : 'Expression needs edits'}</div>
                <p className="result-copy">{serverResult.valid ? `Detected as ${modeDetails[serverResult.mode].title}. ${serverResult.verificationMessage}` : serverResult.verificationMessage}</p>
                {serverResult.valid && <div className="verification-badges"><span>{serverResult.animatable ? 'Dynamic coordinates' : 'Static plot'}</span><span>{serverResult.supports2dFallback ? '2D fallback ready' : 'No 2D fallback'}</span></div>}
                {serverResult.variables.length > 0 && <div className="variable-list">{serverResult.variables.map((variable) => <span className="variable" key={variable}>{variable}</span>)}</div>}
                {serverResult.suggestions.length > 0 && <div className="suggestion-list">{serverResult.suggestions.map((suggestion) => <span className="suggestion" key={suggestion}>{suggestion}</span>)}</div>}
                {!serverResult.valid && <div className="failure-recovery"><span>Local preview can keep you moving.</span><button className="recovery-btn" type="button" onClick={recoverWithFallback}>Load safe fallback</button></div>}
              </div>
            ) : (
              <div className="server-result"><div className="result-title"><span className="status-dot state-pending" /> Awaiting a cue</div><p className="result-copy">The local engine will classify your expression as you type.</p></div>
            )}
          </section>

          <section className="panel-section">
            <div className="panel-heading"><h2>Render out</h2><ArrowDownToLine className="icon muted" /></div>
             <div className="export-options">
                <label className="export-field">Filename
                  <input className="export-input" value={filename} placeholder={filenameFromEquation(renderEquation)} onChange={(event) => setFilename(event.target.value)} aria-label="Export filename" />
               </label>
                <div className="export-field watermark-lock"><span>Watermark</span><strong>{BRAND_WATERMARK}</strong><small>Permanent on canvas and exports</small></div>
                <div className="export-field"><span>Video profile</span><strong className="export-profile-value">HD 1280×720 · 60 FPS</strong><small>Browser chooses MP4 when available, otherwise WebM</small></div>
               <label className="check-row"><input type="checkbox" checked={showFps} onChange={(event) => setShowFps(event.target.checked)} /> Include FPS readout</label>
             </div>
            <div className="export-stack">
               <button className="export-btn primary" type="button" onClick={captureWebm} data-testid="button-export-webm"><MonitorPlay className="icon" /> Capture HD 720p / 60 FPS</button>
              <button className="export-btn" type="button" onClick={downloadPng} data-testid="button-export-png-secondary"><Upload className="icon" /> Save PNG frame</button>
            </div>
            {exportStatus && <p className="result-copy" style={{ marginTop: 9 }} data-testid="status-export">{exportStatus}</p>}
          </section>
        </aside>
      </main>
       <footer className="studio-footer">
         <span>Second Solution Studio</span>
         <span className="footer-tagline">Visualize Mathematics Like Never Before</span>
         <span className="mono">LOCAL-FIRST · CPU ADAPTIVE</span>
       </footer>
    </div>
  );
}

function LandingRoute() {
  const [, setLocation] = useLocation();
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up' | null>(null);
  return (
    <>
      <LandingPage
        onAuth={(nextMode) => setAuthMode(nextMode)}
      onStart={(example) => {
        if (!example) {
          setLocation('/studio');
          return;
        }
        setLocation(`/studio?mode=${encodeURIComponent(example.mode)}&equation=${encodeURIComponent(example.equation)}`);
      }}
      />
      {authMode && <AuthModalRoute mode={authMode} onClose={() => setAuthMode(null)} onModeChange={setAuthMode} />}
    </>
  );
}

function AuthModalRoute({
  mode,
  onModeChange,
  onClose,
}: {
  mode: 'sign-in' | 'sign-up';
  onModeChange: (mode: 'sign-in' | 'sign-up') => void;
  onClose: () => void;
}) {
  return (
    <div className="auth-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
        <div className="auth-modal-heading">
          <div><span className="landing-eyebrow">Second Solution Studio account</span><h2 id="auth-modal-title">{mode === 'sign-in' ? 'Welcome back.' : 'Start your next proof.'}</h2><p>Email/password and configured social sign-in are supported.</p></div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Close authentication dialog"><X className="icon" /></button>
        </div>
        <div className="auth-mode-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected={mode === 'sign-in'} className={mode === 'sign-in' ? 'active' : ''} onClick={() => onModeChange('sign-in')}>Login</button>
          <button type="button" role="tab" aria-selected={mode === 'sign-up'} className={mode === 'sign-up' ? 'active' : ''} onClick={() => onModeChange('sign-up')}>Sign up</button>
        </div>
        <div className="auth-component-wrap">
          {mode === 'sign-in' ? <SignIn routing="hash" appearance={clerkAppearance} signUpUrl={`${basePath}/sign-up`} forceRedirectUrl={`${basePath}/studio`} /> : <SignUp routing="hash" appearance={clerkAppearance} signInUrl={`${basePath}/sign-in`} forceRedirectUrl={`${basePath}/studio`} />}
        </div>
      </div>
    </div>
  );
}

function SignInPage() {
  return <div className="auth-page-shell"><SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} appearance={clerkAppearance} forceRedirectUrl={`${basePath}/studio`} /></div>;
}

function SignUpPage() {
  return <div className="auth-page-shell"><SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} appearance={clerkAppearance} forceRedirectUrl={`${basePath}/studio`} /></div>;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingRoute} />
      <Route path="/sign-in/*?" component={SignInPage} />
      <Route path="/sign-up/*?" component={SignUpPage} />
      <Route path="/studio" component={MainStudio} />
      <Route component={NotFound} />
    </Switch>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function stripBase(path: string) {
  return basePath && path.startsWith(basePath) ? path.slice(basePath.length) || '/' : path;
}

function ClerkApp() {
  const [, setLocation] = useLocation();
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return <WouterRouter base={basePath}><ClerkApp /></WouterRouter>;
}

export default App;