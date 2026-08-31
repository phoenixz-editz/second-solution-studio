import { useEffect, useRef, type CSSProperties } from 'react';

export type AmbientParticlesProps = {
  className?: string;
  style?: CSSProperties;
  particleCount?: number;
  nodeColor?: string;
  lineColor?: string;
  nodeOpacity?: number;
  lineOpacity?: number;
  speed?: number;
  connectionDistance?: number;
  dprCap?: number;
  paused?: boolean;
  respectReducedMotion?: boolean;
  ariaHidden?: boolean;
};

type Particle = {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  phase: number;
  amplitude: number;
};

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function AmbientParticles({
  className = '',
  style,
  particleCount = 54,
  nodeColor = '#c7f36b',
  lineColor = '#72d8ff',
  nodeOpacity = 0.62,
  lineOpacity = 0.2,
  speed = 0.35,
  connectionDistance = 135,
  dprCap = 1.75,
  paused = false,
  respectReducedMotion = true,
  ariaHidden = true,
}: AmbientParticlesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof window === 'undefined') return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const random = seededRandom(7241);
    const count = clamp(Math.floor(particleCount), 8, 120);
    const particles: Particle[] = Array.from({ length: count }, () => ({
      x: random(),
      y: random(),
      radius: 0.7 + random() * 1.7,
      vx: (random() - 0.5) * 0.13,
      vy: (random() - 0.5) * 0.1,
      phase: random() * Math.PI * 2,
      amplitude: 0.4 + random() * 0.9,
    }));

    let width = 1;
    let height = 1;
    let dpr = 1;
    let animationFrame = 0;
    let isVisible = true;
    let isDocumentVisible = document.visibilityState !== 'hidden';
    let isReducedMotion = false;
    let lastTime = performance.now();

    const mediaQuery = respectReducedMotion
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    isReducedMotion = Boolean(mediaQuery?.matches);

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      dpr = clamp(window.devicePixelRatio || 1, 1, Math.max(1, dprCap));
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw(performance.now(), true);
    };

    const draw = (now: number, isStaticFrame = false) => {
      const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      context.clearRect(0, 0, width, height);

      if (!isStaticFrame && !isReducedMotion) {
        particles.forEach((particle) => {
          const flow = Math.sin(now * 0.00016 + particle.phase) * particle.amplitude;
          particle.x += (particle.vx + flow * 0.006) * delta * speed * 5;
          particle.y += (particle.vy + Math.cos(now * 0.00013 + particle.phase) * particle.amplitude * 0.004) * delta * speed * 5;
          if (particle.x < -0.04) particle.x = 1.04;
          if (particle.x > 1.04) particle.x = -0.04;
          if (particle.y < -0.04) particle.y = 1.04;
          if (particle.y > 1.04) particle.y = -0.04;
        });
      }

      const points = particles.map((particle) => ({
        x: particle.x * width,
        y: particle.y * height,
        radius: particle.radius,
      }));
      const maxDistance = Math.max(30, connectionDistance);

      context.lineWidth = 0.7;
      for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
        for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
          const first = points[firstIndex];
          const second = points[secondIndex];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > maxDistance) continue;
          context.globalAlpha = lineOpacity * (1 - distance / maxDistance);
          context.strokeStyle = lineColor;
          context.beginPath();
          context.moveTo(first.x, first.y);
          context.lineTo(second.x, second.y);
          context.stroke();
        }
      }

      context.fillStyle = nodeColor;
      points.forEach((point) => {
        context.globalAlpha = nodeOpacity;
        context.beginPath();
        context.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
        context.fill();
      });
      context.globalAlpha = 1;
    };

    const shouldAnimate = () => !paused && isVisible && isDocumentVisible && !isReducedMotion;

    const frame = (now: number) => {
      draw(now);
      if (shouldAnimate()) animationFrame = window.requestAnimationFrame(frame);
      else animationFrame = 0;
    };

    const start = () => {
      if (animationFrame || !shouldAnimate()) return;
      lastTime = performance.now();
      animationFrame = window.requestAnimationFrame(frame);
    };

    const stop = () => {
      if (!animationFrame) return;
      window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
    };

    const handleVisibility = (visible: boolean) => {
      isVisible = visible;
      if (visible) start();
      else stop();
    };

    const handleDocumentVisibility = () => {
      isDocumentVisible = document.visibilityState !== 'hidden';
      if (isDocumentVisible) start();
      else stop();
    };

    const handleReducedMotion = (event: MediaQueryListEvent | MediaQueryList) => {
      isReducedMotion = Boolean(event.matches);
      if (isReducedMotion) {
        stop();
        draw(performance.now(), true);
      } else {
        start();
      }
    };

    resize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', handleDocumentVisibility);

    const intersectionObserver = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => handleVisibility(Boolean(entry?.isIntersecting)), {
        rootMargin: '120px',
        threshold: 0.01,
      });
    intersectionObserver?.observe(canvas);

    if (mediaQuery) {
      if ('addEventListener' in mediaQuery) mediaQuery.addEventListener('change', handleReducedMotion);
      else (mediaQuery as MediaQueryList & { addListener: (listener: (event: MediaQueryListEvent) => void) => void }).addListener(handleReducedMotion);
    }
    if (shouldAnimate()) start();

    return () => {
      stop();
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleDocumentVisibility);
      if (mediaQuery) {
        if ('removeEventListener' in mediaQuery) mediaQuery.removeEventListener('change', handleReducedMotion);
        else (mediaQuery as MediaQueryList & { removeListener: (listener: (event: MediaQueryListEvent) => void) => void }).removeListener(handleReducedMotion);
      }
    };
  }, [
    connectionDistance,
    dprCap,
    lineColor,
    lineOpacity,
    nodeColor,
    nodeOpacity,
    particleCount,
    paused,
    respectReducedMotion,
    speed,
  ]);

  const canvasClassName = `ambient-particles ${className}`.trim();

  return (
    <canvas
      ref={canvasRef}
      className={canvasClassName}
      style={{ display: 'block', width: '100%', height: '100%', pointerEvents: 'none', ...style }}
      aria-hidden={ariaHidden}
      data-testid="canvas-ambient-particles"
    />
  );
}

export default AmbientParticles;