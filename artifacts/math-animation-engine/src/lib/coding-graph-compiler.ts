import type { StudioMode } from '@/hooks/use-equation-validator';
import type { ResolvedStudioMode } from '@/lib/math-parser';

export type CodingGraphMode = Extract<StudioMode, 'code2d' | 'code3d'>;

export type CodingGraphCompileResult = {
  equation: string;
  renderMode: Exclude<ResolvedStudioMode, 'code2d' | 'code3d'>;
  error?: string;
};

const DEFAULT_2D = 'sin(x + t) * exp(-0.08 * x^2)';
const DEFAULT_3D = 'x^2 + y^2 + z^2 - 4 = 0';

function normalizeMathSource(value: string) {
  return value
    .replace(/\/\/.*$/gm, '')
    .replace(/#.*$/gm, '')
    .replace(/\b(?:Math|math|np|numpy)\s*\.\s*(PI|E)\b/gi, (_, constant: string) => constant.toLowerCase())
    .replace(/\b(?:Math|math|np|numpy)\s*\.\s*/g, '')
    .replace(/\b(?:toRadians|radians|deg)\s*\(([^()]*)\)/gi, '(($1) * pi / 180)')
    .replace(/\b(?:Math|math)\.pow\s*\(/gi, 'pow(')
    .replace(/\*\*/g, '^')
    .replace(/!==/g, '!=')
    .replace(/===/g, '==')
    .replace(/^\s*(?:return|yield)\s+/i, '')
    .replace(/[;,\s]+$/g, '')
    .trim();
}

function matchingBrace(source: string, openingIndex: number) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingParenthesis(source: string, openingIndex: number) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitStatements(source: string) {
  const statements: string[] = [];
  let start = 0;
  let parenDepth = 0;
  let squareDepth = 0;
  let curlyDepth = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(') parenDepth += 1;
    if (character === ')') parenDepth = Math.max(0, parenDepth - 1);
    if (character === '[') squareDepth += 1;
    if (character === ']') squareDepth = Math.max(0, squareDepth - 1);
    if (character === '{') curlyDepth += 1;
    if (character === '}') curlyDepth = Math.max(0, curlyDepth - 1);
    if ((character === ';' || character === '\n') && parenDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
      const statement = source.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }
  const finalStatement = source.slice(start).trim();
  if (finalStatement) statements.push(finalStatement);
  return statements;
}

function objectReturnToTuple(expression: string) {
  const trimmed = expression.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return trimmed;
  const fields = splitStatements(trimmed.slice(1, -1).replace(/,/g, ';\n'));
  const coordinates = new Map<string, string>();
  fields.forEach((field) => {
    const match = field.match(/^\s*([xyz])\s*:\s*([\s\S]+)$/i);
    if (match) coordinates.set(match[1].toLowerCase(), match[2].trim());
  });
  if (!coordinates.has('x') || !coordinates.has('y')) return trimmed;
  return `[${coordinates.get('x')}, ${coordinates.get('y')}${coordinates.has('z') ? `, ${coordinates.get('z')}` : ''}]`;
}

function compileFunctionBody(source: string) {
  const functionIndex = source.search(/\bfunction\b/);
  const arrowIndex = source.indexOf('=>');
  let openingIndex = -1;
  if (functionIndex >= 0) {
    const parameterOpenIndex = source.indexOf('(', functionIndex);
    const parameterCloseIndex = parameterOpenIndex >= 0
      ? matchingParenthesis(source, parameterOpenIndex)
      : -1;
    openingIndex = parameterCloseIndex >= 0
      ? source.indexOf('{', parameterCloseIndex)
      : -1;
  } else if (arrowIndex >= 0) {
    openingIndex = source.indexOf('{', arrowIndex);
  }
  if (openingIndex < 0) return normalizeMathSource(source);
  const closingIndex = matchingBrace(source, openingIndex);
  if (closingIndex < 0) return '';
  let body = source.slice(openingIndex + 1, closingIndex);

  const conditionalReturn = body.match(
    /if\s*\(([^()]*)\)\s*return\s+([^;{}]+);?\s*else\s*return\s+([^;{}]+);?/i,
  );
  const lastReturnIndex = body.lastIndexOf('return');
  let returnExpression = conditionalReturn
    ? `(${conditionalReturn[1]}) ? (${conditionalReturn[2]}) : (${conditionalReturn[3]})`
    : lastReturnIndex >= 0 ? body.slice(lastReturnIndex + 'return'.length).trim() : '';
  if (returnExpression.endsWith(';')) returnExpression = returnExpression.slice(0, -1).trim();
  returnExpression = objectReturnToTuple(normalizeMathSource(returnExpression));
  if (!returnExpression) return '';
  body = conditionalReturn
    ? body.slice(0, body.indexOf(conditionalReturn[0]))
    : lastReturnIndex >= 0 ? body.slice(0, lastReturnIndex) : body;

  const loopPattern = /for\s*\(\s*(?:let|const|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([^;]+);\s*\1\s*(<=|<|>=|>)\s*([^;]+);\s*\1\s*(\+\+|--|\+=\s*1|-=\s*1)\s*\)\s*\{([\s\S]*?)\}/gi;
  body = body.replace(loopPattern, (_match, variable: string, start: string, relation: string, bound: string, step: string, loopBody: string) => {
    const accumulation = loopBody.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=)\s*([^;]+);?/);
    if (!accumulation) return '';
    const [, accumulator, operator, term] = accumulation;
    const ascending = step.includes('+') || step === '++';
    const upper = ascending
      ? relation === '<' ? `(${bound}) - 1` : bound
      : relation === '>' ? `(${bound}) + 1` : bound;
    const series = `sum(${normalizeMathSource(term)}, ${variable}, ${normalizeMathSource(start)}, ${normalizeMathSource(upper)})`;
    return `${accumulator} = ${accumulator} ${operator === '+=' ? '+' : '-'} ${series};`;
  });

  const statements = splitStatements(body).map((statement) => (
    normalizeMathSource(statement.replace(/^\s*(?:const|let|var)\s+/, ''))
  )).filter(Boolean);
  return [...statements, returnExpression].join('; ');
}

function extractExpression(source: string, mode: CodingGraphMode) {
  const addPlot = source.match(/\\addplot3?\s*(?:\[[^\]]*\])?\s*\{([\s\S]*?)\}/i)?.[1];
  if (/\bfunction\b|=>\s*\{/i.test(source)) return compileFunctionBody(source);
  const explicitAssignment = source.match(
    mode === 'code2d'
      ? /(?:^|\n|\s)(?:y|f|plot)\s*=\s*([^;\n]+)/i
      : /(?:^|\n|\s)(?:z|f|field|surface)\s*=\s*([^;\n]+)/i,
  )?.[1];
  const returned = source.match(/\breturn\s+([^;\n}]+)/i)?.[1];
  const arrow = source.match(/(?:=>|lambda[^:]*:)\s*([^;\n}]+)/i)?.[1];
  return normalizeMathSource(addPlot ?? explicitAssignment ?? returned ?? arrow ?? '');
}

export function compileCodingGraph(source: string, mode: CodingGraphMode): CodingGraphCompileResult {
  const input = source.trim();
  if (!input) {
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: 'Add a return expression to compile this source.',
    };
  }

  const expression = extractExpression(input, mode);
  if (!expression) {
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: 'No graph expression found. Use return, y =, z =, or a PGFPlots addplot block.',
    };
  }

  if (!/^[\w\s.+\-*/%^(),=[\]<>!?&|:'"πθ;]+$/i.test(expression)) {
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: 'The source contains syntax the local graph adapter cannot compile yet.',
    };
  }

  if (mode === 'code2d') {
    return { equation: expression, renderMode: 'function' };
  }

  const isTuple = /^\s*[\[(].*[,].*[,].*[\])]\s*$/s.test(expression);
  if (isTuple) return { equation: expression, renderMode: 'parametric3d' };
  const isImplicit = /\bz\b/i.test(expression) || /\b(?:field|implicit|isosurface)\b/i.test(input);
  if (isImplicit) {
    const equation = /\s=\s/.test(expression) ? expression : `${expression} = 0`;
    return { equation, renderMode: 'implicit3d' };
  }
  return { equation: `z = ${expression}`, renderMode: 'surface3d' };
}
