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

export type DynamicDomain = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  tMin: number;
  tMax: number;
  worldExtent?: number;
};

const math = create(all, {});
const AST_CACHE_LIMIT = 512;
const MAX_EXPRESSION_LENGTH = 200_000;
const MAX_AST_NODES = 100_000;
const MAX_AST_DEPTH = 1_024;
const MAX_CALCULUS_TERMS = 16_384;
const MAX_INTEGRAL_STEPS = 256;
const astCache = new Map<string, any>();
const compiledAstCache = new Map<string, CompiledExpression>();
const mathFunctions = new Set([
  'abs', 'acos', 'acosh', 'acot', 'acoth', 'acsc', 'acsch', 'asec', 'asech',
  'asin', 'asinh', 'atan', 'atan2', 'atanh', 'cbrt', 'ceil', 'cos', 'cosh',
  'cot', 'coth', 'csc', 'csch', 'exp', 'floor', 'gcd', 'lcm', 'log', 'log10',
  'max', 'min', 'mod', 'nthRoot', 'pow', 'round', 'sec', 'sech', 'sign', 'sin',
  'sinh', 'sqrt', 'tan', 'tanh', 'trunc', 'ln', 'derivative', 'integral', 'int',
  'sum',
]);
const mathConstants = new Set(['true', 'false', 'null', 'undefined', 'pi', 'tau', 'e', 'i', 'Infinity', 'NaN']);

function rememberCached<T>(cache: Map<string, T>, key: string, value: T) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > AST_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
  return value;
}

function getCachedAst(source: string) {
  if (source.length > MAX_EXPRESSION_LENGTH) throw new Error('Expression is too large to evaluate safely.');
  const cached = astCache.get(source);
  if (cached) {
    astCache.delete(source);
    astCache.set(source, cached);
    return cached;
  }
  const ast = math.parse(source);
  let nodeCount = 0;
  ast.traverse(() => {
    nodeCount += 1;
    if (nodeCount > MAX_AST_NODES) throw new Error('Expression contains too many AST nodes.');
  });
  let depth = 0;
  let maximumDepth = 0;
  for (const character of source) {
    if (character === '(' || character === '[' || character === '{') {
      depth += 1;
      maximumDepth = Math.max(maximumDepth, depth);
    } else if (character === ')' || character === ']' || character === '}') {
      depth = Math.max(0, depth - 1);
    }
  }
  if (maximumDepth > MAX_AST_DEPTH) throw new Error('Expression nesting is too deep to evaluate safely.');
  return rememberCached(astCache, source, ast);
}

function cseNodeWeight(node: any) {
  let weight = 0;
  node.traverse((child: any) => {
    if (child?.type !== 'SymbolNode' && child?.type !== 'ConstantNode') weight += 1;
  });
  return weight;
}

function buildCsePlan(ast: any) {
  const candidates = new Map<string, { node: any; count: number; weight: number }>();
  ast.traverse((node: any) => {
    if (!['OperatorNode', 'FunctionNode'].includes(node?.type)) return;
    const key = node.toString();
    const existing = candidates.get(key);
    if (existing) existing.count += 1;
    else candidates.set(key, { node, count: 1, weight: cseNodeWeight(node) });
  });
  const selected = [...candidates.entries()]
    .filter(([, candidate]) => candidate.count > 1 && candidate.weight >= 3)
    .sort(([, left], [, right]) => right.weight - left.weight);
  if (selected.length === 0) return { ast, helpers: [] as Array<{ name: string; node: any }> };

  const helpers = selected.map(([key, candidate], index) => ({
    key,
    name: `cse${index}`,
    node: candidate.node.clone(),
  }));
  const replacements = new Map(helpers.map(({ key, name }) => [key, name]));
  const transformed = ast.clone().transform((node: any) => {
    const replacement = replacements.get(node.toString());
    return replacement ? math.parse(replacement) : node;
  });
  return { ast: transformed, helpers: helpers.map(({ name, node }) => ({ name, node })) };
}

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

function normalizeCalculusNotation(input: string) {
  return input
    .replace(/\\frac\s*\{\s*d\s*\}\s*\{\s*d\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/gi, 'derivative_d_$1')
    .replace(/\bd\s*\/\s*d\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/gi, 'derivative_d_$1(')
    .replace(/\\(?:int|integral)\b/gi, 'int')
    .replace(/\\sum\b/gi, 'sum');
}

type CalculusOperation = {
  placeholder: string;
  kind: 'derivative' | 'integral' | 'sum';
  expression: CompiledExpression;
  variable: string;
  lower?: CompiledExpression;
  upper?: CompiledExpression;
};

function unquoteExpression(value: string) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2
    && ((trimmed.startsWith('"') && trimmed.endsWith('"'))
      || (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function calculusCallName(name: string) {
  const normalized = name.toLowerCase();
  if (normalized === 'derivative' || normalized === 'differentiate' || normalized.startsWith('derivative_d_')) {
    return 'derivative' as const;
  }
  if (normalized === 'int' || normalized === 'integral') return 'integral' as const;
  if (normalized === 'sum') return 'sum' as const;
  return null;
}

function rewriteCalculusCalls(source: string, operations: CalculusOperation[]) {
  let rewritten = '';
  let index = 0;
  while (index < source.length) {
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0];
    if (!identifier) {
      rewritten += source[index];
      index += 1;
      continue;
    }
    const openIndex = index + identifier.length;
    let cursor = openIndex;
    while (cursor < source.length && /\s/.test(source[cursor] ?? '')) cursor += 1;
    const kind = calculusCallName(identifier);
    if (!kind || source[cursor] !== '(') {
      rewritten += identifier;
      index = openIndex;
      continue;
    }

    let depth = 0;
    let closeIndex = -1;
    for (let candidate = cursor; candidate < source.length; candidate += 1) {
      if (source[candidate] === '(') depth += 1;
      if (source[candidate] === ')') {
        depth -= 1;
        if (depth === 0) {
          closeIndex = candidate;
          break;
        }
      }
    }
    if (closeIndex < 0) {
      rewritten += identifier;
      index = openIndex;
      continue;
    }

    const argumentsList = splitTopLevel(source.slice(cursor + 1, closeIndex), new Set([',']));
    const expressionSource = unquoteExpression(argumentsList[0] ?? '');
    if (!expressionSource) {
      rewritten += source.slice(index, closeIndex + 1);
      index = closeIndex + 1;
      continue;
    }

    let variable = 'x';
    let lowerSource: string | undefined;
    let upperSource: string | undefined;
    if (kind === 'derivative') {
      const suffixVariable = identifier.toLowerCase().startsWith('derivative_d_')
        ? identifier.slice('derivative_d_'.length)
        : undefined;
      variable = unquoteExpression(argumentsList[1] ?? suffixVariable ?? 'x') || 'x';
    } else if (kind === 'integral') {
      if (argumentsList.length >= 4) {
        variable = unquoteExpression(argumentsList[1] ?? 'x') || 'x';
        lowerSource = argumentsList[2];
        upperSource = argumentsList[3];
      } else {
        lowerSource = argumentsList[1];
        upperSource = argumentsList[2];
      }
    } else if (argumentsList.length >= 4) {
      variable = unquoteExpression(argumentsList[1] ?? 'n') || 'n';
      lowerSource = argumentsList[2];
      upperSource = argumentsList[3];
    }

    const placeholder = `calc${operations.length}`;
    operations.push({
      placeholder,
      kind,
      expression: compileMathExpression(expressionSource),
      variable,
      lower: lowerSource ? compileMathExpression(lowerSource) : undefined,
      upper: upperSource ? compileMathExpression(upperSource) : undefined,
    });
    rewritten += placeholder;
    index = closeIndex + 1;
  }
  return rewritten;
}

function referencedSymbols(source: string) {
  const symbols = new Set<string>();
  try {
    getCachedAst(source).traverse((node: any) => {
      if (node?.type !== 'SymbolNode') return;
      const name = String(node.name ?? '');
      if (!mathFunctions.has(name.toLowerCase()) && !mathConstants.has(name)) symbols.add(name);
    });
  } catch {
    // The main compiler reports malformed syntax; no scope defaults are needed here.
  }
  return symbols;
}

function evaluateCalculusOperation(operation: CalculusOperation, scope: Record<string, number>) {
  const evaluateAt = (value: number) => Number(operation.expression.evaluate({ ...scope, [operation.variable]: value }));
  if (operation.kind === 'derivative') {
    const center = Number(scope[operation.variable] ?? 0);
    const step = 1e-4 * Math.max(1, Math.abs(center));
    const forward = evaluateAt(center + step);
    const backward = evaluateAt(center - step);
    return Number.isFinite(forward) && Number.isFinite(backward)
      ? (forward - backward) / (2 * step)
      : Number.NaN;
  }

  const lower = Number(operation.lower?.evaluate(scope));
  const upper = Number(operation.upper?.evaluate(scope));
  if (!Number.isFinite(lower)) return Number.NaN;
  if (operation.kind === 'sum') {
    const first = Math.ceil(lower);
    if (upper === Number.POSITIVE_INFINITY) {
      let total = 0;
      let consecutiveSmallTerms = 0;
      for (let index = first; index < first + MAX_CALCULUS_TERMS; index += 1) {
        const value = evaluateAt(index);
        if (!Number.isFinite(value)) return Number.NaN;
        total += value;
        consecutiveSmallTerms = Math.abs(value) < 1e-9 ? consecutiveSmallTerms + 1 : 0;
        if (consecutiveSmallTerms >= 8) return total;
      }
      return total;
    }
    if (!Number.isFinite(upper)) return Number.NaN;
    const last = Math.floor(upper);
    const count = Math.min(MAX_CALCULUS_TERMS, Math.max(0, last - first + 1));
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      const value = evaluateAt(first + index);
      if (!Number.isFinite(value)) return Number.NaN;
      total += value;
    }
    return total;
  }

  const interval = upper - lower;
  if (Math.abs(interval) < 1e-12) return 0;
  const direction = interval < 0 ? -1 : 1;
  const start = direction === 1 ? lower : upper;
  const end = direction === 1 ? upper : lower;
  const steps = MAX_INTEGRAL_STEPS;
  const step = (end - start) / steps;
  let total = evaluateAt(start) + evaluateAt(end);
  if (!Number.isFinite(total)) return Number.NaN;
  for (let index = 1; index < steps; index += 1) {
    const value = evaluateAt(start + index * step);
    if (!Number.isFinite(value)) return Number.NaN;
    total += (index % 2 === 0 ? 2 : 4) * value;
  }
  return direction * (step / 3) * total;
}

function compileMathExpression(source: string): CompiledExpression {
  const normalized = normalizeCalculusNotation(source);
  const cached = compiledAstCache.get(normalized);
  if (cached) {
    compiledAstCache.delete(normalized);
    compiledAstCache.set(normalized, cached);
    return cached;
  }
  const operations: CalculusOperation[] = [];
  const rewritten = rewriteCalculusCalls(normalized, operations);
  const parsed = getCachedAst(rewritten);
  const csePlan = buildCsePlan(parsed);
  const compiled = csePlan.ast.compile();
  const helperPrograms = csePlan.helpers.map(({ name, node }) => ({
    name,
    compiled: node.compile(),
  }));
  const helperNames = new Set(helperPrograms.map(({ name }) => name));
  const symbols = [...referencedSymbols(rewritten)].filter((name) => !helperNames.has(name));
  const result: CompiledExpression = {
    evaluate: (scope) => {
      const runtimeScope = withAliases(scope);
      symbols.forEach((name) => {
        if (runtimeScope[name] === undefined) runtimeScope[name] = 0;
      });
      operations.forEach((operation) => {
        runtimeScope[operation.placeholder] = evaluateCalculusOperation(operation, runtimeScope);
      });
      helperPrograms.forEach(({ name, compiled: helper }) => {
        runtimeScope[name] = helper.evaluate(runtimeScope);
      });
      return compiled.evaluate(runtimeScope);
    },
  };
  return rememberCached(compiledAstCache, normalized, result);
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
  return normalizeCalculusNotation(input
    .replace(/\\left|\\right/g, '')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\pi/g, 'pi')
    .replace(/\\ln/g, 'ln')
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
    .trim());
}

function stripTrailingZeroEquality(input: string) {
  return input.match(/^\s*(.+?)\s*=\s*0\s*$/)?.[1]?.trim() ?? input.trim();
}

export function normalizeSurfaceExpression(input: string) {
  const renderSource = stripTrailingZeroEquality(
    splitProgramStatements(normalizeForPreview(input)).renderExpression,
  );
  return renderSource
    .replace(/^\s*z\s*=\s*/i, '')
    .replace(/^\s*(.+?)\s*=\s*z\s*$/i, '$1')
    .replace(/\s*-\s*z\s*$/i, '')
    .trim();
}

export function normalizeSurfaceEquation(input: string) {
  const normalized = normalizeForPreview(input);
  const program = splitProgramStatements(normalized);
  const expression = normalizeSurfaceExpression(program.renderExpression);
  if (program.helpers.length === 0) return expression;
  return [
    ...program.helpers.map((helper) => `${helper.name} = ${helper.source}`),
    expression,
  ].join('; ');
}

export function normalizeImplicitField(input: string, mode: 'implicit' | 'implicit3d') {
  const normalized = normalizeForPreview(input);
  const program = splitProgramStatements(normalized);
  const renderExpression = stripTrailingZeroEquality(program.renderExpression);
  const equality = renderExpression.match(/^\s*(.+?)\s*=\s*(.+?)\s*$/);
  if (equality) {
    return `(${equality[1]}) - (${equality[2]})`;
  }
  // In 3D implicit mode, a pasted height/function expression is the
  // zero-level set f(x,y) - z = 0. Without this conversion the field is
  // independent of z, so marching tetrahedra can miss the surface entirely.
  if (mode === 'implicit3d' && !/\bz\b/i.test(renderExpression)) {
    return `(${renderExpression}) - z`;
  }
  return `(${renderExpression})`;
}

function unwrapAstNode(node: any): any {
  return node?.type === 'ParenthesisNode' ? node.content : node;
}

type ConstantBindings = Record<string, number>;

function constantAstValue(node: any, bindings: ConstantBindings = {}): number | null {
  const current = unwrapAstNode(node);
  if (!current) return null;
  if (current.type === 'ConstantNode') {
    const value = Number(current.value);
    return Number.isFinite(value) ? value : null;
  }
  if (current.type === 'SymbolNode') {
    const name = String(current.name ?? '').toLowerCase();
    if (name === 'pi') return Math.PI;
    if (name === 'e') return Math.E;
    const value = bindings[current.name] ?? bindings[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (current.type === 'OperatorNode' && Array.isArray(current.args)) {
    const values = current.args.map((argument: any) => constantAstValue(argument, bindings));
    if (values.some((value: number | null) => value === null)) return null;
    if (values.length === 1 && (current.op === '+' || current.op === '-')) {
      return current.op === '-' ? -values[0]! : values[0]!;
    }
    if (values.length !== 2) return null;
    const [left, right] = values as [number, number];
    if (current.op === '+') return left + right;
    if (current.op === '-') return left - right;
    if (current.op === '*') return left * right;
    if (current.op === '/') return Math.abs(right) < Number.EPSILON ? null : left / right;
    if (current.op === '^') return left ** right;
    if (current.op === '%') return right === 0 ? null : left % right;
    return null;
  }
  if (current.type === 'FunctionNode') {
    const name = String(current.fn?.name ?? current.name ?? '').toLowerCase();
    const values = (current.args ?? []).map((argument: any) => constantAstValue(argument, bindings));
    if (values.some((value: number | null) => value === null)) return null;
    const args = values as number[];
    const functions: Record<string, (...values: number[]) => number> = {
      abs: Math.abs,
      cos: Math.cos,
      exp: Math.exp,
      log: Math.log,
      log10: Math.log10,
      sin: Math.sin,
      sqrt: Math.sqrt,
      tan: Math.tan,
    };
    const fn = functions[name];
    if (!fn) return null;
    const value = fn(...args);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

function numericAstValue(node: any, bindings: ConstantBindings = {}) {
  return constantAstValue(node, bindings);
}

function numericMagnitudeFromAst(node: any, denominator = false): number {
  const current = unwrapAstNode(node);
  if (!current) return 0;
  if (current.type === 'ConstantNode') {
    const value = Number(current.value);
    return !denominator && Number.isFinite(value) ? Math.abs(value) : 0;
  }
  if (current.type === 'OperatorNode' && Array.isArray(current.args)) {
    return current.args.reduce(
      (maximum: number, argument: any, index: number) => Math.max(
        maximum,
        numericMagnitudeFromAst(
          argument,
          denominator || (current.op === '/' && index === 1),
        ),
      ),
      0,
    );
  }
  if (current.type === 'FunctionNode' && Array.isArray(current.args)) {
    return current.args.reduce(
      (maximum: number, argument: any) => Math.max(maximum, numericMagnitudeFromAst(argument, denominator)),
      0,
    );
  }
  return 0;
}

function axisOffset(node: any, axis: string, bindings: ConstantBindings = {}): number | null {
  const current = unwrapAstNode(node);
  if (current?.type === 'SymbolNode' && current.name?.toLowerCase() === axis) return 0;
  if (current?.type !== 'OperatorNode' || !Array.isArray(current.args) || current.args.length !== 2) return null;
  const left = unwrapAstNode(current.args[0]);
  const right = unwrapAstNode(current.args[1]);
  const leftIsAxis = left?.type === 'SymbolNode' && left.name?.toLowerCase() === axis;
  const rightIsAxis = right?.type === 'SymbolNode' && right.name?.toLowerCase() === axis;
  const leftValue = numericAstValue(left, bindings);
  const rightValue = numericAstValue(right, bindings);
  if (current.op === '+' && leftIsAxis && rightValue !== null) return rightValue;
  if (current.op === '+' && rightIsAxis && leftValue !== null) return leftValue;
  if (current.op === '-' && leftIsAxis && rightValue !== null) return -rightValue;
  return null;
}

function collectHighPowerAxes(
  node: any,
  bindings: ConstantBindings,
  axes = new Set<string>(),
): Set<string> {
  const current = unwrapAstNode(node);
  if (!current) return axes;
  if (current.type === 'OperatorNode' && current.op === '^' && Array.isArray(current.args)) {
    const exponent = numericAstValue(current.args[1], bindings);
    if (exponent !== null && Number.isInteger(exponent) && exponent >= 4) {
      for (const axis of ['x', 'y', 'z']) {
        if (axisOffset(current.args[0], axis, bindings) !== null) axes.add(axis);
      }
    }
  }
  if (Array.isArray(current.args)) {
    current.args.forEach((argument: any) => collectHighPowerAxes(argument, bindings, axes));
  }
  return axes;
}

function squaredAxisOffset(node: any, bindings: ConstantBindings) {
  const current = unwrapAstNode(node);
  if (current?.type !== 'OperatorNode' || current.op !== '^' || !Array.isArray(current.args)) return null;
  const exponent = numericAstValue(current.args[1], bindings);
  if (exponent === null || Math.abs(exponent) !== 2) return null;
  for (const axis of ['x', 'y', 'z']) {
    const offset = axisOffset(current.args[0], axis, bindings);
    if (offset !== null) return { axis, center: -offset };
  }
  return null;
}

function productFactors(node: any): any[] {
  const current = unwrapAstNode(node);
  if (current?.type === 'OperatorNode' && current.op === '*' && Array.isArray(current.args)) {
    return current.args.flatMap((argument: any) => productFactors(argument));
  }
  if (current?.type === 'OperatorNode' && current.op === '-' && Array.isArray(current.args) && current.args.length === 1) {
    return [{ type: 'ConstantNode', value: -1 }, ...productFactors(current.args[0])];
  }
  return [current];
}

function quadraticProductSignal(node: any, bindings: ConstantBindings) {
  const factors = productFactors(node);
  const squared = factors
    .map((factor) => squaredAxisOffset(factor, bindings))
    .find((signal): signal is { axis: string; center: number } => Boolean(signal));
  if (!squared) return null;
  let coefficient = 1;
  for (const factor of factors) {
    const value = constantAstValue(factor, bindings);
    if (value !== null) coefficient *= value;
  }
  return Number.isFinite(coefficient) && coefficient < 0
    ? { ...squared, decayRate: -coefficient }
    : null;
}

function analyzeDynamicDomain(input: string) {
  const normalized = normalizeForPreview(input);
  const program = splitProgramStatements(normalized);
  const renderExpression = program.renderExpression;
  const bindings: ConstantBindings = { pi: Math.PI, e: Math.E };
  program.helpers.forEach((helper) => {
    try {
      const value = constantAstValue(math.parse(helper.source), bindings);
      if (value !== null) bindings[helper.name] = value;
    } catch {
      // Helper values that depend on graph variables cannot shape the domain.
    }
  });
  const signals = {
    hasX: /\bx\b/i.test(renderExpression),
    hasY: /\by\b/i.test(renderExpression),
    hasZ: /\bz\b/i.test(renderExpression),
    hasTrig: /\b(?:sin|cos|tan|sec|csc|cot)\b/i.test(renderExpression),
    xCenters: [] as number[],
    yCenters: [] as number[],
    zCenters: [] as number[],
    quadraticAxes: new Set<string>(),
    decayRates: { x: 0, y: 0, z: 0 },
    localizedAxes: new Set<string>(),
    localizedSpan: 0,
    numericMagnitude: 0,
  };

  try {
    const root = math.parse(renderExpression);
    signals.numericMagnitude = numericMagnitudeFromAst(root);
    root.traverse((node: any) => {
      if (node?.type === 'FunctionNode') {
        const name = String(node.fn?.name ?? node.name ?? '').toLowerCase();
        if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot'].includes(name)) signals.hasTrig = true;
      }
      if (node?.type !== 'OperatorNode' || node.op !== '^' || !Array.isArray(node.args)) return;
      const exponent = numericAstValue(node.args[1], bindings);
      if (exponent === null || Math.abs(exponent) !== 2) return;
      for (const axis of ['x', 'y', 'z']) {
        const offset = axisOffset(node.args[0], axis, bindings);
        if (offset === null) continue;
        signals.quadraticAxes.add(axis);
        // (axis - center)^2 has an AST offset of -center.
        const center = -offset;
        if (axis === 'x') signals.xCenters.push(center);
        if (axis === 'y') signals.yCenters.push(center);
        if (axis === 'z') signals.zCenters.push(center);
      }
    });

    root.traverse((node: any) => {
      if (node?.type !== 'FunctionNode') return;
      const name = String(node.fn?.name ?? node.name ?? '').toLowerCase();
      if (name === 'exp' && Array.isArray(node.args)) {
        const signal = quadraticProductSignal(node.args[0], bindings);
        if (signal) {
          signals.decayRates[signal.axis as 'x' | 'y' | 'z'] = Math.max(
            signals.decayRates[signal.axis as 'x' | 'y' | 'z'],
            signal.decayRate,
          );
        }
        collectHighPowerAxes(node.args[0], bindings).forEach((axis) => signals.localizedAxes.add(axis));
        if (signals.localizedAxes.size > 0) signals.localizedSpan = Math.max(signals.localizedSpan, 2);
      }
    });
    root.traverse((node: any) => {
      if (node?.type !== 'OperatorNode' || node.op !== '/' || !Array.isArray(node.args)) return;
      collectHighPowerAxes(node.args[1], bindings).forEach((axis) => signals.localizedAxes.add(axis));
      if (signals.localizedAxes.size > 0) signals.localizedSpan = Math.max(signals.localizedSpan, 3);
    });
  } catch {
    // Regex-derived signals below keep auto range useful while the input is incomplete.
    for (const match of renderExpression.matchAll(/(?<![A-Za-z_])[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?![A-Za-z_])/g)) {
      const value = Math.abs(Number(match[0]));
      if (Number.isFinite(value)) signals.numericMagnitude = Math.max(signals.numericMagnitude, value);
    }
  }

  const addCenter = (axis: 'x' | 'y' | 'z', value: number) => {
    if (!Number.isFinite(value)) return;
    const centers = axis === 'x' ? signals.xCenters : axis === 'y' ? signals.yCenters : signals.zCenters;
    if (!centers.some((center) => Math.abs(center - value) < 1e-6)) centers.push(value);
  };
  for (const axis of ['x', 'y', 'z'] as const) {
    const decayPattern = new RegExp(`-\\s*(\\d+(?:\\.\\d*)?|\\.\\d+)\\s*\\*[^;\\n]*\\b${axis}\\b`, 'gi');
    for (const match of renderExpression.matchAll(decayPattern)) {
      const rate = Number(match[1]);
      if (Number.isFinite(rate)) signals.decayRates[axis] = Math.max(signals.decayRates[axis], rate);
    }
  }
  for (const axis of ['x', 'y', 'z'] as const) {
    const centerPattern = new RegExp(`\\b${axis}\\s*([+-])\\s*(\\d+(?:\\.\\d*)?|\\.\\d+)`, 'gi');
    for (const match of renderExpression.matchAll(centerPattern)) {
      const value = Number(match[2]) * (match[1] === '-' ? 1 : -1);
      addCenter(axis, value);
    }
  }
  signals.xCenters.forEach((value) => addCenter('x', value));
  signals.yCenters.forEach((value) => addCenter('y', value));
  signals.zCenters.forEach((value) => addCenter('z', value));
  return signals;
}

function dynamicAxisBounds(
  centers: number[],
  hasTrig: boolean,
  hasQuadratic: boolean,
  decayRate: number,
  numericMagnitude: number,
  extentLimits: { min?: number; max?: number } = {},
  localizedSpan = 0,
) {
  const fixedExtent = extentLimits.min !== undefined
    && extentLimits.max !== undefined
    && extentLimits.min === extentLimits.max
    ? extentLimits.min
    : null;
  if (fixedExtent !== null) return { min: -fixedExtent, max: fixedExtent };
  // A wave's natural two-period view is derived from its characteristic period.
  if (hasTrig) return { min: -2 * Math.PI, max: 2 * Math.PI };

  const center = centers.length > 0
    ? centers.reduce((sum, value) => sum + value, 0) / centers.length
    : 0;
  const decaySpan = decayRate > 0 ? 3 / Math.sqrt(decayRate) : 0;
  const algebraicSpan = hasQuadratic && decayRate === 0 ? 2.5 : 0;
  const magnitudeSpan = decayRate === 0 && numericMagnitude > 1 ? Math.sqrt(numericMagnitude) : 0;
  const span = Math.max(1.5, decaySpan, algebraicSpan, magnitudeSpan);
  const minimumExtent = Math.max(2, extentLimits.min ?? 0);
  const localizedExtent = localizedSpan > 0 && centers.length === 0 ? localizedSpan : null;
  const automaticExtent = localizedExtent ?? Math.ceil((Math.abs(center) + span) / 4) * 4;
  const extent = Math.min(
    extentLimits.max ?? Number.POSITIVE_INFINITY,
    Math.max(minimumExtent, automaticExtent),
  );
  return { min: -extent, max: extent };
}

export function resolveDynamicDomain(input: string, mode: ResolvedStudioMode): DynamicDomain {
  const signals = analyzeDynamicDomain(input);
  const surfaceExtentLimits = mode === 'surface3d' ? { min: 8, max: 8 } : undefined;
  const implicit3dExtentLimits = mode === 'implicit3d' ? { max: 10 } : undefined;
  const xBounds = dynamicAxisBounds(
    signals.xCenters,
    signals.hasTrig,
    signals.quadraticAxes.has('x'),
    signals.decayRates.x,
    signals.numericMagnitude,
    surfaceExtentLimits ?? implicit3dExtentLimits,
    signals.localizedAxes.has('x') ? signals.localizedSpan : 0,
  );
  const yBounds = dynamicAxisBounds(
    signals.yCenters,
    signals.hasTrig,
    signals.quadraticAxes.has('y'),
    signals.decayRates.y,
    signals.numericMagnitude,
    surfaceExtentLimits ?? implicit3dExtentLimits,
    signals.localizedAxes.has('y') ? signals.localizedSpan : 0,
  );
  const zBounds = dynamicAxisBounds(
    signals.zCenters,
    false,
    signals.quadraticAxes.has('z'),
    signals.decayRates.z,
    signals.numericMagnitude,
    implicit3dExtentLimits,
    signals.localizedAxes.has('z') ? signals.localizedSpan : 0,
  );
  const tMax = mode === 'parametric' || mode === 'parametric3d'
    ? (/(?:^|[,(]\s*)t\s*\*\s*(?:sin|cos)|(?:sin|cos)\s*\(\s*t\s*\)\s*\*\s*t/i.test(input) ? 10 : 2 * Math.PI)
    : 2 * Math.PI;
  const xMin = signals.hasX || mode === 'polar' ? xBounds.min : -xBounds.max;
  const xMax = signals.hasX || mode === 'polar' ? xBounds.max : -xBounds.min;
  const yMin = signals.hasY ? yBounds.min : -yBounds.max;
  const yMax = signals.hasY ? yBounds.max : -yBounds.min;
  const worldExtent = mode === 'surface3d'
    ? 8
    : mode === 'implicit3d'
      ? Math.min(10, Math.max(
        Math.abs(xMin),
        Math.abs(xMax),
        Math.abs(yMin),
        Math.abs(yMax),
        ...(signals.hasZ ? [Math.abs(zBounds.min), Math.abs(zBounds.max)] : []),
      ))
    : undefined;
  return { xMin, xMax, yMin, yMax, tMin: 0, tMax, worldExtent };
}

export function isImplicit3dHeightmapExpression(input: string) {
  const normalized = normalizeForPreview(input);
  const renderExpression = splitProgramStatements(normalized).renderExpression;
  return !/\bz\b/i.test(renderExpression)
    && !/^\s*(.+?)\s*=\s*(.+?)\s*$/.test(renderExpression);
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

export type EquationVariableDefinition = {
  name: string;
  source: string;
};

const reservedEquationNames = new Set([
  'x', 'y', 'z', 't', 'u', 'theta', 'a', 'b', 'v', 'r', 'phi', 'pi', 'e',
]);

export function extractEquationVariableDefinitions(input: string) {
  const statements = splitTopLevel(normalizeForPreview(input), new Set([';', '\n']));
  const definitions: EquationVariableDefinition[] = [];
  const renderStatements: string[] = [];
  const assignmentPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(?!=)([\s\S]+)$/;
  statements.forEach((statement) => {
    const assignment = statement.match(assignmentPattern);
    const name = assignment?.[1] ?? '';
    if (assignment && !reservedEquationNames.has(name.toLowerCase())) {
      definitions.push({ name, source: assignment[2].trim() });
    } else if (statement.trim()) {
      renderStatements.push(statement.trim());
    }
  });
  return {
    definitions,
    renderExpression: renderStatements.join('; ').trim(),
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
      return { kind: 'surface', expression: compileProgramExpression(normalizeSurfaceEquation(input)) };
    }
    if (mode === 'implicit' || mode === 'implicit3d') {
      return {
        kind: 'implicit',
        expression: compileProgramPart(input, normalizeImplicitField(input, mode)),
      };
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
