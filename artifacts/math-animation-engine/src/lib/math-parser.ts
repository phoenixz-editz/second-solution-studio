import { all, create } from 'mathjs';
import type { StudioMode } from '@/hooks/use-equation-validator';

export type CompiledExpression = { evaluate: (scope: Record<string, number>) => unknown };
export type GraphPoint = { x: number; y: number };
export type ResolvedStudioMode = Exclude<StudioMode, 'auto'>;
export type CompiledPoint = { x: CompiledExpression; y: CompiledExpression };
export type GraphEvaluator =
  | { kind: 'function'; expression: CompiledExpression }
  | { kind: 'parametric'; x: CompiledExpression; y: CompiledExpression }
  | { kind: 'implicit'; expression: CompiledExpression }
  | { kind: 'polar'; expression: CompiledExpression }
  | { kind: 'vector'; x: CompiledExpression; y: CompiledExpression }
  | { kind: 'points'; points: CompiledPoint[] }
  | null;

const math = create(all, {});

function stripOuterCollections(input: string) {
  let value = input.trim();
  while (
    (value.startsWith('[') && value.endsWith(']')) ||
    (value.startsWith('{') && value.endsWith('}'))
  ) {
    const opening = value[0];
    const closing = opening === '[' ? ']' : '}';
    let depth = 0;
    let closesAtEnd = true;
    for (let index = 0; index < value.length; index += 1) {
      if (value[index] === opening) depth += 1;
      if (value[index] === closing) depth -= 1;
      if (depth === 0 && index < value.length - 1) {
        closesAtEnd = false;
        break;
      }
    }
    if (!closesAtEnd) break;
    value = value.slice(1, -1).trim();
  }
  return value;
}

export function normalizeForPreview(input: string) {
  return stripOuterCollections(input
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\pi/g, 'pi')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\{([^{}]+)\}/g, '($1)')
    .trim());
}

export function detectSmartMode(input: string): ResolvedStudioMode {
  const normalized = normalizeForPreview(input);
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const equality = normalized.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
  const hasPair = normalized.startsWith('(') || normalized.startsWith('[');
  const hasTime = /\bt\b/i.test(normalized);
  const hasSpatialVariables =
    /\bx\b/i.test(normalized) && /\by\b/i.test(normalized) && /\bz\b/i.test(normalized);

  if ((lines.length > 1 && lines.every((line) => Boolean(parsePointPair(line)))) || /\)\s*[,;\n]\s*\(/.test(normalized)) return 'points';
  if (hasSpatialVariables) return 'implicit3d';
  if (equality && !/^\s*[xy]\s*$/i.test(equality[1]) && /\bx\b/i.test(normalized) && /\by\b/i.test(normalized)) return 'implicit';
  if (/\b(?:r|theta)\b|θ/i.test(normalized) && !/\b(?:x|y)\b/i.test(normalized)) return 'polar';
  if (hasPair && hasTime && Boolean(splitPair(normalized))) return 'parametric';
  if (hasPair && Boolean(splitPair(normalized))) return 'vector';
  return 'function';
}

function splitTopLevel(input: string, delimiters: Set<string>) {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '(') parenDepth += 1;
    if (character === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (character === '[') squareDepth += 1;
    if (character === ']') squareDepth = Math.max(0, squareDepth - 1);
    if (character === '{') curlyDepth += 1;
    if (character === '}') curlyDepth = Math.max(0, curlyDepth - 1);

    if (delimiters.has(character) && parenDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
      const part = input.slice(start, index).trim();
      if (part) parts.push(part);
      start = index + 1;
    }
  }

  const finalPart = input.slice(start).trim();
  if (finalPart) parts.push(finalPart);
  return parts;
}

function splitPointExpressions(input: string) {
  const parts: string[] = [];
  let start = 0;
  let parenDepth = 0;
  const push = (end: number) => {
    const part = input.slice(start, end).trim();
    if (part) parts.push(part);
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '(') {
      parenDepth += 1;
      continue;
    }
    if (character === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      if (parenDepth === 0) {
        let next = index + 1;
        while (next < input.length && /\s/.test(input[next])) next += 1;
        if (input[next] === '(') {
          push(index + 1);
          start = next;
          index = next - 1;
        }
      }
      continue;
    }
    if (parenDepth === 0 && (character === ';' || character === '\n')) {
      push(index);
      start = index + 1;
      continue;
    }
    if (parenDepth === 0 && character === ',') {
      let previous = index - 1;
      while (previous >= start && /\s/.test(input[previous])) previous -= 1;
      let next = index + 1;
      while (next < input.length && /\s/.test(input[next])) next += 1;
      if (input[previous] === ')' && input[next] === '(') {
        push(index);
        start = next;
        index = next - 1;
      }
    }
  }

  push(input.length);
  return parts;
}

function parsePointPair(input: string) {
  let pair = input.trim();
  const hasParentheses = pair.startsWith('(') && pair.endsWith(')');
  const hasBrackets = pair.startsWith('[') && pair.endsWith(']');
  if (hasParentheses || hasBrackets) pair = pair.slice(1, -1).trim();
  const parts = splitTopLevel(pair, new Set([',']));
  return parts.length === 2 ? parts : null;
}

export function splitEquationExpressions(input: string, mode: StudioMode) {
  const raw = input.trim();
  const isWrappedCollection =
    (raw.startsWith('[') && raw.endsWith(']')) ||
    (raw.startsWith('{') && raw.endsWith('}'));
  const stripped = stripOuterCollections(normalizeForPreview(input));
  if (!stripped) return [];
  if (mode === 'auto') mode = detectSmartMode(stripped);
  if (mode === 'points') return [stripped];

  if (mode === 'parametric') {
    if (/[;\n]/.test(stripped)) {
      return splitTopLevel(stripped, new Set([';', '\n'])).flatMap((part) =>
        part.trim().startsWith('(') ? splitTopLevel(part, new Set([','])) : [part],
      );
    }
    if (/^\s*x\s*\(\s*t\s*\)=/i.test(stripped) || !stripped.trim().startsWith('(')) {
      return [stripped];
    }
    const grouped = splitTopLevel(stripped, new Set([',']));
    return grouped.length > 1 ? grouped : [stripped];
  }

  const expressions = splitTopLevel(stripped, new Set([',', ';', '\n']));
  // Also accept the natural "y = sin(x) y = cos(x)" form. Only split
  // function-like inputs at a second y= assignment so spaces inside an
  // expression remain untouched.
  if ((mode === 'function' || mode === 'piecewise') && expressions.length === 1) {
    const assignments = [...stripped.matchAll(/\by\s*=/gi)].map((match) => match.index ?? -1);
    if (assignments.length > 1) {
      return assignments.map((start, index) =>
        stripped.slice(start, assignments[index + 1]).trim(),
      );
    }
  }
  return !isWrappedCollection && expressions.length === 1 ? [stripped] : expressions;
}

function splitPair(input: string) {
  const named = input.match(/^\s*x\s*\(\s*t\s*\)\s*=\s*(.+?),\s*y\s*\(\s*t\s*\)\s*=\s*(.+)\s*$/i);
  if (named) return [named[1], named[2]];

  let pair = input.trim();
  if (pair.startsWith('(') && pair.endsWith(')')) pair = pair.slice(1, -1).trim();
  const parts = splitTopLevel(pair, new Set([',']));
  return parts.length === 2 ? parts : null;
}

function parseManualPoints(input: string) {
  return splitPointExpressions(input).flatMap((line): CompiledPoint[] => {
    const pair = parsePointPair(line);
    if (!pair) return [];
    try {
      return [{ x: math.compile(pair[0]), y: math.compile(pair[1]) }];
    } catch {
      return [];
    }
  });
}

export function evaluatePointSet(points: CompiledPoint[], time: number, speed = 1): GraphPoint[] {
  return points.flatMap((point) => {
    try {
      const scope = { t: time, a: time, b: speed };
      const x = Number(point.x.evaluate(scope));
      const y = Number(point.y.evaluate(scope));
      return Number.isFinite(x) && Number.isFinite(y) ? [{ x, y }] : [];
    } catch {
      return [];
    }
  });
}

export function buildGraphEvaluator(equation: string, mode: StudioMode): GraphEvaluator {
  const input = normalizeForPreview(equation);
  try {
    if (mode === 'points') {
      const points = parseManualPoints(input);
      return points.length >= 2 ? { kind: 'points', points } : null;
    }
    if (mode === 'parametric' || mode === 'vector') {
      const parts = splitPair(input);
      if (!parts) return null;
      return mode === 'vector'
        ? { kind: 'vector', x: math.compile(parts[0]), y: math.compile(parts[1]) }
        : { kind: 'parametric', x: math.compile(parts[0]), y: math.compile(parts[1]) };
    }
    if (mode === 'implicit' || mode === 'implicit3d') {
      const equality = input.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
      if (equality) {
        return { kind: 'implicit', expression: math.compile(`(${equality[1]}) - (${equality[2]})`) };
      }
      // 3D implicit mode also accepts the common zero-form:
      // x^2 + y^2 + z^2 - 4
      return mode === 'implicit3d'
        ? { kind: 'implicit', expression: math.compile(`(${input})`) }
        : null;
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
