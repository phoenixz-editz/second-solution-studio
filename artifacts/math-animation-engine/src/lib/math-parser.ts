import { all, create } from 'mathjs';
import type { StudioMode } from '@/hooks/use-equation-validator';

export type CompiledExpression = { evaluate: (scope: Record<string, number>) => unknown };
export type GraphPoint = { x: number; y: number };
export type ResolvedStudioMode = Exclude<StudioMode, 'auto'>;
export type CompiledPoint = { x: CompiledExpression; y: CompiledExpression };
export type GraphEvaluator =
  | { kind: 'function'; expression: CompiledExpression }
  | { kind: 'parametric'; x: CompiledExpression; y: CompiledExpression; z?: CompiledExpression }
  | { kind: 'implicit'; expression: CompiledExpression }
  | { kind: 'surface'; expression: CompiledExpression }
  | { kind: 'polar'; expression: CompiledExpression }
  | { kind: 'vector'; x: CompiledExpression; y: CompiledExpression; z?: CompiledExpression }
  | { kind: 'points'; points: CompiledPoint[] }
  | null;

const math = create(all, {});
const mathFunctions = new Set([
  'abs', 'acos', 'acosh', 'acot', 'acoth', 'acsc', 'acsch', 'asec', 'asech',
  'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil', 'cos', 'cosh',
  'cot', 'coth', 'csc', 'csch', 'exp', 'floor', 'gcd', 'lcm', 'log', 'log10',
  'max', 'min', 'mod', 'nthRoot', 'pow', 'round', 'sec', 'sech', 'sign', 'sin',
  'sinh', 'sqrt', 'tan', 'tanh', 'trunc',
]);
const mathConstants = new Set(['true', 'false', 'null', 'undefined', 'pi', 'e', 'i', 'Infinity', 'NaN']);

export type LocalValidationResult = {
  valid: boolean;
  mode: ResolvedStudioMode;
  animatable: boolean;
  hasTimeVariable: boolean;
  supports2dFallback: boolean;
  verificationStatus: 'static' | 'dynamic' | 'invalid';
  verificationMessage: string;
  normalized: string;
  error: string | null;
  suggestions: string[];
  variables: string[];
};

function withAliases(scope: Record<string, number>) {
  const next = { ...scope };
  // Keep parameter aliases aligned without letting a cartesian x coordinate
  // overwrite an explicit animation parameter. This matters for vector fields
  // that use both x/y and t/u in the same expression.
  const parameter = next.u ?? next.theta ?? next.t ?? next.x ?? 0;
  const secondary = next.v ?? next.r ?? next.phi ?? next.y ?? next.b ?? 0;
  next.u ??= parameter;
  next.theta ??= parameter;
  next.t ??= parameter;
  next.a ??= parameter;
  next.v ??= secondary;
  next.r ??= secondary;
  next.phi ??= secondary;
  return next;
}

function compileMathExpression(source: string): CompiledExpression {
  const compiled = math.compile(source);
  return {
    evaluate: (scope) => compiled.evaluate(withAliases(scope)),
  };
}

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
  return input
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\pi/g, 'pi')
    .replace(/\\sin/g, 'sin')
    .replace(/\\cos/g, 'cos')
    .replace(/\\tan/g, 'tan')
    .replace(/\\sqrt\s*\{([^{}]+)\}/g, 'sqrt($1)')
    .replace(/\{([^{}]+)\}/g, '($1)')
    .replace(/(\S)\s+mod\s+(\S)/gi, '$1 % $2')
    // A pasted shader expression often carries a stray delimiter or typo.
    // Remove only unambiguous trailing noise; valid math in the middle is left intact.
    .replace(/[;,]+$/g, '')
    .replace(/\s+q+$/i, '')
    .trim();
}

export function normalizeSurfaceExpression(input: string) {
  const renderSource = splitProgramStatements(normalizeForPreview(input)).renderExpression;
  return renderSource
    .replace(/^\s*z\s*=\s*/i, '')
    .replace(/^\s*(.+?)\s*=\s*z\s*$/i, '$1')
    .replace(/\s*-\s*z\s*$/i, '')
    .trim();
}

export function detectSmartMode(input: string): ResolvedStudioMode {
  const normalized = normalizeForPreview(input);
  const program = splitProgramStatements(normalized);
  const renderSource = program.renderExpression;
  const lines = normalized.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const equality = renderSource.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
  const hasPair = renderSource.startsWith('(') || renderSource.startsWith('[');
  const hasTime = /\b(?:t|u|theta)\b/i.test(renderSource);
  const hasSpatialVariables =
    /\bx\b/i.test(normalized) && /\by\b/i.test(normalized) && /\bz\b/i.test(normalized);
  const pair = splitPair(renderSource);
  const hasNamedParametricPair = Boolean(getNamedCoordinateParts(renderSource));

  if ((lines.length > 1 && lines.every((line) => Boolean(parsePointPair(line)))) || /\)\s*[,;\n]\s*\(/.test(normalized)) return 'points';
  // A three-component tuple is a vector when it is static and a parametric
  // curve when one of its coordinates is driven by t/u/theta.
  if (pair && hasPair && pair.length === 3) return hasTime ? 'parametric3d' : 'vector';
  if (pair && (hasNamedParametricPair || hasTime)) return pair.length === 3 ? 'parametric3d' : 'parametric';
  if (equality && /^\s*z\s*=/i.test(equality[0]) && /\bx\b/i.test(renderSource) && /\by\b/i.test(renderSource)) return 'surface3d';
  if (hasSpatialVariables) return 'implicit3d';
  if (equality && !/^\s*[xy]\s*$/i.test(equality[1]) && /\bx\b/i.test(renderSource) && /\by\b/i.test(renderSource)) return 'implicit';
  if (/\bx\b/i.test(renderSource) && /\by\b/i.test(renderSource) && !equality) return 'surface3d';
  if (/\bx\b/i.test(renderSource) && /\by\b/i.test(renderSource)) return 'implicit';
  if (/\b(?:r|theta)\b|θ/i.test(normalized) && !/\b(?:x|y)\b/i.test(normalized)) return 'polar';
  if (hasPair && Boolean(pair)) return 'vector';
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

function splitProgramStatements(input: string) {
  const statements = splitTopLevel(input.trim(), new Set([';', '\n']));
  const assignmentPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)([\s\S]+)$/;
  const helpers: Array<{ name: string; source: string }> = [];
  let index = 0;
  while (index < Math.max(0, statements.length - 1)) {
    const assignment = statements[index].match(assignmentPattern);
    if (!assignment) break;
    helpers.push({ name: assignment[1], source: assignment[2].trim() });
    index += 1;
  }
  return {
    helpers,
    renderExpression: statements.slice(index).join(';').trim() || input.trim(),
  };
}

function compileProgramExpression(input: string) {
  const program = splitProgramStatements(input);
  const render = compileMathExpression(program.renderExpression);
  if (program.helpers.length === 0) return render;
  const helpers = program.helpers.map((helper) => ({
    name: helper.name,
    expression: compileMathExpression(helper.source),
  }));
  return {
    evaluate: (scope: Record<string, number>) => {
      const programScope: Record<string, number> = withAliases(scope);
      helpers.forEach(({ name, expression }) => {
        const value = expression.evaluate(programScope);
        programScope[name] = Number(value);
      });
      return render.evaluate(programScope);
    },
  };
}

function compileProgramPart(input: string, renderSource: string) {
  const program = splitProgramStatements(input);
  if (program.helpers.length === 0) return compileProgramExpression(renderSource);
  return compileProgramExpression([
    ...program.helpers.map((helper) => `${helper.name} = ${helper.source}`),
    renderSource,
  ].join(';'));
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

function getNamedCoordinateParts(input: string) {
  const renderSource = stripOuterCollections(input);
  const assignments = splitTopLevel(renderSource, new Set([',']))
    .map((part) => part.match(/^\s*([xyz])\s*\(\s*(?:t|u|theta)\s*\)\s*=\s*(.+)\s*$/i))
    .filter((match): match is RegExpMatchArray => Boolean(match));
  if (assignments.length < 2) return null;

  const byCoordinate = new Map(assignments.map((match) => [match[1].toLowerCase(), match[2]]));
  const x = byCoordinate.get('x');
  const y = byCoordinate.get('y');
  if (!x || !y) return null;
  const z = byCoordinate.get('z');
  return z ? [x, y, z] : [x, y];
}

export function splitEquationExpressions(input: string, mode: StudioMode) {
  const stripped = normalizeForPreview(input);
  if (!stripped) return [];
  if (mode === 'auto') mode = detectSmartMode(stripped);
  if (mode === 'points') return [stripped];
  if (splitProgramStatements(stripped).helpers.length > 0) return [stripped];

  if (mode === 'parametric' || mode === 'parametric3d') {
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
  return expressions.length === 1 ? [stripped] : expressions;
}

function splitPair(input: string) {
  const renderSource = splitProgramStatements(input).renderExpression;
  const named = getNamedCoordinateParts(renderSource);
  if (named) return named;

  let pair = renderSource.trim();
  if (
    (pair.startsWith('(') && pair.endsWith(')')) ||
    (pair.startsWith('[') && pair.endsWith(']'))
  ) pair = pair.slice(1, -1).trim();
  const parts = splitTopLevel(pair, new Set([',']));
  return parts.length >= 2 && parts.length <= 3 ? parts : null;
}

function parseManualPoints(input: string) {
  return splitPointExpressions(input).flatMap((line): CompiledPoint[] => {
    const pair = parsePointPair(line);
    if (!pair) return [];
    try {
      return [{ x: compileProgramExpression(pair[0]), y: compileProgramExpression(pair[1]) }];
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
    if (mode === 'parametric' || mode === 'parametric3d' || mode === 'vector') {
      const parts = splitPair(input);
      if (!parts) return null;
      return mode === 'vector'
        ? { kind: 'vector', x: compileProgramPart(input, parts[0]), y: compileProgramPart(input, parts[1]), z: parts[2] ? compileProgramPart(input, parts[2]) : undefined }
        : { kind: 'parametric', x: compileProgramPart(input, parts[0]), y: compileProgramPart(input, parts[1]), z: parts[2] ? compileProgramPart(input, parts[2]) : undefined };
    }
    if (mode === 'surface3d') {
      return { kind: 'surface', expression: compileProgramExpression(normalizeSurfaceExpression(input)) };
    }
    if (mode === 'implicit' || mode === 'implicit3d') {
      const renderSource = splitProgramStatements(input).renderExpression;
      const equality = renderSource.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
      if (equality) {
        return { kind: 'implicit', expression: compileProgramPart(input, `(${equality[1]}) - (${equality[2]})`) };
      }
      return { kind: 'implicit', expression: compileProgramExpression(`(${renderSource})`) };
    }
    if (mode === 'polar') {
      const renderSource = splitProgramStatements(input).renderExpression;
      const expression = renderSource.match(/^\s*r\s*=\s*(.+)$/i)?.[1] ?? renderSource;
      return { kind: 'polar', expression: compileProgramExpression(expression) };
    }
    const renderSource = splitProgramStatements(input).renderExpression;
    const expression = renderSource.match(/^\s*y\s*=\s*(.+)$/i)?.[1] ?? renderSource;
    return { kind: 'function', expression: compileProgramExpression(expression) };
  } catch {
    return null;
  }
}

function extractVariables(input: string) {
  const variables = new Set<string>();
  for (const match of input.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const name = match[0];
    if (mathFunctions.has(name) || mathConstants.has(name)) continue;
    const after = input.slice(match.index! + name.length).trimStart();
    if (after.startsWith('(') && mathFunctions.has(name)) continue;
    variables.add(name);
  }
  return [...variables].sort((left, right) => left.localeCompare(right));
}

export function validateEquationLocally(equation: string, mode: StudioMode): LocalValidationResult {
  const normalized = normalizeForPreview(equation);
  const resolvedMode = mode === 'auto' ? detectSmartMode(normalized) : mode;
  const hasTimeVariable = /\b(?:t|u|theta)\b/i.test(normalized);
  const variables = extractVariables(normalized);
  if (!normalized) {
    return {
      valid: false,
      mode: resolvedMode,
      animatable: false,
      hasTimeVariable,
      supports2dFallback: true,
      verificationStatus: 'invalid',
      verificationMessage: 'Enter an equation or vector expression.',
      normalized,
      error: 'Equation is empty.',
      suggestions: ['Try sin(x + t)', 'Try [cos(u), sin(u), 0]'],
      variables,
    };
  }
  try {
    const evaluator = buildGraphEvaluator(normalized, resolvedMode);
    const valid = Boolean(evaluator);
    return {
      valid,
      mode: resolvedMode,
      animatable: valid && hasTimeVariable,
      hasTimeVariable,
      supports2dFallback: resolvedMode !== 'implicit3d' && resolvedMode !== 'parametric3d' || normalized.includes('x') && normalized.includes('y'),
      verificationStatus: valid ? (hasTimeVariable ? 'dynamic' : 'static') : 'invalid',
      verificationMessage: valid
        ? hasTimeVariable ? 'Local validation active. Dynamic coordinates ready.' : 'Local validation active. Static plot ready.'
        : 'This expression could not be compiled locally.',
      normalized,
      error: valid ? null : 'The expression could not be compiled by mathjs.',
      suggestions: valid ? [] : ['Check brackets and separators', 'Use mod or % for remainder'],
      variables,
    };
  } catch (error) {
    return {
      valid: false,
      mode: resolvedMode,
      animatable: false,
      hasTimeVariable,
      supports2dFallback: true,
      verificationStatus: 'invalid',
      verificationMessage: error instanceof Error ? error.message : 'Local parser rejected the expression.',
      normalized,
      error: error instanceof Error ? error.message : 'Local parser rejected the expression.',
      suggestions: ['Check brackets and separators', 'Use mod or % for remainder'],
      variables,
    };
  }
}
