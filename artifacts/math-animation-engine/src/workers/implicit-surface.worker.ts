import { buildGraphEvaluator, isImplicit3dHeightmapExpression } from '@/lib/math-parser';

type GenerateRequest = {
  type: 'generate';
  id: number;
  equation: string;
  mode?: 'implicit3d' | 'surface3d';
  phase: number;
  speed: number;
  resolution: number;
  extent: number;
  heightScale?: number;
};

type CancelRequest = {
  type: 'cancel';
  id: number;
};

type WorkerRequest = GenerateRequest | CancelRequest;

let activeRequestId = 0;

function compileSurfaceEquation(source: string, mode: 'implicit3d' | 'surface3d') {
  const evaluator = buildGraphEvaluator(source, mode);
  if (!evaluator || (evaluator.kind !== 'implicit' && evaluator.kind !== 'surface')) {
    throw new Error('The 3D expression could not be compiled locally.');
  }
  return evaluator.expression;
}

function safeEvaluate(expression: { evaluate: (scope: Record<string, number>) => unknown }, x: number, y: number, z: number, phase: number, speed: number) {
  try {
    const value = Number(expression.evaluate({
      x,
      y,
      z,
      t: phase,
      u: phase,
      theta: phase,
      v: speed,
      r: speed,
      phi: speed,
      a: phase,
      b: speed,
    }));
    if (Number.isFinite(value)) return Math.max(-1e6, Math.min(1e6, value));
    if (value === Number.POSITIVE_INFINITY) return 1e6;
    if (value === Number.NEGATIVE_INFINITY) return -1e6;
    return Number.NaN;
  } catch {
    return Number.NaN;
  }
}

function isUsableExtent(value: number) {
  return Number.isFinite(value) && value > 0.05 && value < 100;
}

function yieldToBrowser() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function generateSurface(request: GenerateRequest) {
  const mode = request.mode ?? 'implicit3d';
  const expression = compileSurfaceEquation(request.equation, mode);
  const resolution = Math.max(8, Math.min(96, Math.round(request.resolution)));
  const extent = isUsableExtent(request.extent) ? request.extent : 3.4;
  // A bare f(x,y) entered in 3D Implicit mode is normalized to f(x,y)-z=0.
  // It is also exactly representable as a heightmap, so use that equivalent
  // mesh branch instead of asking the volume extractor to resolve a nearly
  // planar zero crossing across the entire volume.
  if (mode === 'surface3d' || (mode === 'implicit3d' && isImplicit3dHeightmapExpression(request.equation))) {
    const positions: number[] = [];
    const indices: number[] = [];
    const heights = new Float32Array((resolution + 1) * (resolution + 1));
    const step = (extent * 2) / resolution;
    const indexOf = (x: number, y: number) => y * (resolution + 1) + x;
    for (let y = 0; y <= resolution; y += 1) {
      for (let x = 0; x <= resolution; x += 1) {
        const worldX = -extent + x * step;
        const worldY = extent - y * step;
        const height = safeEvaluate(expression, worldX, worldY, 0, request.phase, request.speed);
        heights[indexOf(x, y)] = Number.isFinite(height)
          ? Math.max(-extent * 1.8, Math.min(extent * 1.8, height))
          : Number.NaN;
      }
      if (activeRequestId !== request.id) return;
      await yieldToBrowser();
    }
    let minimumHeight = Number.POSITIVE_INFINITY;
    let maximumHeight = Number.NEGATIVE_INFINITY;
    heights.forEach((height) => {
      if (!Number.isFinite(height)) return;
      minimumHeight = Math.min(minimumHeight, height);
      maximumHeight = Math.max(maximumHeight, height);
    });
    const heightRange = maximumHeight - minimumHeight;
    const heightCenter = Number.isFinite(heightRange) && heightRange > 1e-5
      ? (minimumHeight + maximumHeight) * 0.5
      : 0;
    const targetHalfHeight = extent * 0.55 * clamp(request.heightScale ?? 1, 0.25, 4);
    const heightMultiplier = Number.isFinite(heightRange) && heightRange > 1e-5
      ? targetHalfHeight / (heightRange * 0.5)
      : 1;
    const vertexIndex = (x: number, y: number) => {
      const height = heights[indexOf(x, y)];
      if (!Number.isFinite(height)) return -1;
      const index = positions.length / 3;
      const scaledHeight = Number.isFinite(heightRange) && heightRange > 1e-5
        ? (height - heightCenter) * heightMultiplier
        : height;
      positions.push(
        -extent + x * step,
        extent - y * step,
        clamp(scaledHeight, -extent * 1.8, extent * 1.8),
      );
      return index;
    };
    for (let y = 0; y < resolution; y += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const topLeft = vertexIndex(x, y);
        const topRight = vertexIndex(x + 1, y);
        const bottomLeft = vertexIndex(x, y + 1);
        const bottomRight = vertexIndex(x + 1, y + 1);
        if ([topLeft, topRight, bottomLeft, bottomRight].some((index) => index < 0)) continue;
        indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
      }
      if (activeRequestId !== request.id) return;
      await yieldToBrowser();
    }
    const response = {
      type: 'result' as const,
      id: request.id,
      positions: new Float32Array(positions).buffer,
      indices: new Uint32Array(indices).buffer,
    };
    (globalThis as unknown as { postMessage: (message: unknown, transfer: ArrayBuffer[]) => void }).postMessage(
      response,
      [response.positions, response.indices],
    );
    return;
  }
  const size = resolution + 1;
  const values = new Float32Array(size * size * size);
  const indexOf = (x: number, y: number, z: number) => (z * size + y) * size + x;
  const step = (extent * 2) / resolution;

  for (let z = 0; z <= resolution; z += 1) {
    for (let y = 0; y <= resolution; y += 1) {
      for (let x = 0; x <= resolution; x += 1) {
        values[indexOf(x, y, z)] = safeEvaluate(
          expression,
          -extent + x * step,
          -extent + y * step,
          -extent + z * step,
          request.phase,
          request.speed,
        );
      }
    }
    if (activeRequestId !== request.id) return;
    await yieldToBrowser();
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexMap = new Map<string, number>();
  const weldTolerance = Math.max(step * 0.08, 1e-5);
  const vertexIndex = (point: [number, number, number]) => {
    const key = point.map((value) => Math.round(value / weldTolerance)).join(':');
    const existing = vertexMap.get(key);
    if (existing !== undefined) return existing;
    const next = vertices.length / 3;
    vertices.push(point[0], point[1], point[2]);
    vertexMap.set(key, next);
    return next;
  };
  const addTriangle = (points: [number, number, number][]) => {
    if (points.length < 3) return;
    const first = vertexIndex(points[0]);
    const second = vertexIndex(points[1]);
    const third = vertexIndex(points[2]);
    if (first === second || second === third || first === third) return;
    indices.push(first, second, third);
  };
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
            const linearAmount = Math.abs(denominator) < 1e-12
              ? 0.5
              : first.value / denominator;
            // Gradient-aware intersection bias acts like a dynamic raymarch
            // step: steep fields use shorter steps near the zero crossing,
            // while shallow fields avoid excessive micro-stepping.
            const gradient = Math.abs(first.value - second.value);
            const adaptiveStep = clamp(1 / (0.8 + gradient * step * 0.035), 0.72, 1.18);
            const amount = clamp(linearAmount + (adaptiveStep - 1) * 0.012, 0, 1);
            intersections.push([
              first.point[0] + (second.point[0] - first.point[0]) * amount,
              first.point[1] + (second.point[1] - first.point[1]) * amount,
              first.point[2] + (second.point[2] - first.point[2]) * amount,
            ]);
          });
          if (intersections.length >= 3) {
            addTriangle([intersections[0], intersections[1], intersections[2]]);
            if (intersections.length >= 4) addTriangle([intersections[0], intersections[2], intersections[3]]);
          }
        });
      }
    }
    if (activeRequestId !== request.id) return;
    await yieldToBrowser();
  }

  if (vertices.length === 0 || indices.length === 0) {
    throw new Error('The 3D field did not produce a finite surface in this viewport.');
  }
  const response = {
    type: 'result' as const,
    id: request.id,
    positions: new Float32Array(vertices).buffer,
    indices: new Uint32Array(indices).buffer,
  };
  (globalThis as unknown as { postMessage: (message: unknown, transfer: ArrayBuffer[]) => void }).postMessage(
    response,
    [response.positions, response.indices],
  );
}

const workerScope = globalThis as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = (event) => {
  const request = event.data;
  if (request.type === 'cancel') {
    activeRequestId = request.id;
    return;
  }
  activeRequestId = request.id;
  void generateSurface(request).catch((error: unknown) => {
    if (activeRequestId !== request.id) return;
    workerScope.postMessage({
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Implicit surface worker failed.',
    });
  });
};