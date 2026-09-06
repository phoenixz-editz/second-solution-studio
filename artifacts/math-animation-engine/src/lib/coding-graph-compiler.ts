import type { StudioMode } from '@/hooks/use-equation-validator';
import type { ResolvedStudioMode } from '@/lib/math-parser';

export type CodingGraphMode = Extract<StudioMode, 'code2d' | 'code3d'>;
export type CodingGraphLanguage = 'javascript' | 'python' | 'glsl';

export type CodingGraphDiagnostic = {
  message: string;
  line: number;
  column: number;
  length: number;
};

export type CodingGraphCompileResult = {
  equation: string;
  renderMode: Exclude<ResolvedStudioMode, 'code2d' | 'code3d'>;
  error?: string;
  diagnostic?: CodingGraphDiagnostic;
};

const DEFAULT_2D = 'sin(x + t) * exp(-0.08 * x^2)';
const DEFAULT_3D = 'x^2 + y^2 + z^2 - 4 = 0';

function normalizePythonSource(source: string) {
  const functionMatch = source.match(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*:\s*([\s\S]*)$/m);
  if (!functionMatch) {
    return source
      .replace(/\bmath\./gi, '')
      .replace(/\*\*/g, '^')
      .replace(/\band\b/gi, '&&')
      .replace(/\bor\b/gi, '||')
      .replace(/\bnot\b/gi, '!')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');
  }
  const [, name, parameters, rawBody] = functionMatch;
  const body = rawBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^(?:if|elif)\s+(.+):$/i, 'if ($1) {').replace(/^else:$/i, '} else {'))
    .join(' ');
  return `function ${name}(${parameters}) { ${body} }`
    .replace(/\bmath\./gi, '')
    .replace(/\*\*/g, '^')
    .replace(/\band\b/gi, '&&')
    .replace(/\bor\b/gi, '||')
    .replace(/\bnot\b/gi, '!')
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false');
}

function normalizeGlslSource(source: string) {
  const functionMatch = source.match(
    /(?:(?:float|double|vec[234]|void)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)\s*\{([\s\S]*)\}/i,
  );
  if (!functionMatch) return source;
  const [, name, rawParameters, body] = functionMatch;
  const parameters = rawParameters
    .split(',')
    .map((parameter) => parameter.trim().replace(/^(?:const\s+)?(?:float|double|int|vec[234])\s+/, ''))
    .filter(Boolean)
    .join(', ');
  const normalizedBody = body
    .replace(/\b(?:float|double|int|bool)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g, '$1 =')
    .replace(/\bvec[234]\s*\(([^()]*)\)/g, '[$1]')
    .replace(/\b[A-Za-z_][A-Za-z0-9_]*\.(x|y|z)\b/g, '$1')
    .replace(/\btrue\b/gi, 'true')
    .replace(/\bfalse\b/gi, 'false');
  return `function ${name}(${parameters}) { ${normalizedBody} }`;
}

function normalizeSourceLanguage(source: string, language: CodingGraphLanguage) {
  if (language === 'python') return normalizePythonSource(source);
  if (language === 'glsl') return normalizeGlslSource(source);
  return source;
}

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

function diagnosticAt(source: string, message: string, index = 0, length = 1): CodingGraphDiagnostic {
  const safeIndex = Math.max(0, Math.min(source.length, index));
  const lineStart = source.lastIndexOf('\n', Math.max(0, safeIndex - 1)) + 1;
  const lineEnd = source.indexOf('\n', safeIndex);
  return {
    message,
    line: source.slice(0, safeIndex).split('\n').length,
    column: safeIndex - lineStart + 1,
    length: Math.max(1, Math.min(length, (lineEnd < 0 ? source.length : lineEnd) - safeIndex || 1)),
  };
}

function delimiterDiagnostic(source: string) {
  const pairs = new Map([[')', '('], [']', '['], ['}', '{']]);
  const stack: Array<{ character: string; index: number }> = [];
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '(' || character === '[' || character === '{') {
      stack.push({ character, index });
      continue;
    }
    const expectedOpening = pairs.get(character);
    if (!expectedOpening) continue;
    const opening = stack.pop();
    if (!opening || opening.character !== expectedOpening) {
      return diagnosticAt(source, `Unexpected "${character}". Check the matching delimiter.`, index);
    }
  }
  const opening = stack.at(-1);
  if (!opening) return undefined;
  const closing = opening.character === '(' ? ')' : opening.character === '[' ? ']' : '}';
  return diagnosticAt(source, `Missing "${closing}" for this "${opening.character}".`, opening.index);
}

function functionBodyOpeningIndex(source: string) {
  const functionIndex = source.search(/\bfunction\b/);
  const arrowIndex = source.indexOf('=>');
  if (functionIndex >= 0) {
    const parameterOpenIndex = source.indexOf('(', functionIndex);
    const parameterCloseIndex = parameterOpenIndex >= 0
      ? matchingParenthesis(source, parameterOpenIndex)
      : -1;
    return parameterCloseIndex >= 0 ? source.indexOf('{', parameterCloseIndex) : -1;
  }
  return arrowIndex >= 0 ? source.indexOf('{', arrowIndex) : -1;
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
  const openingIndex = functionBodyOpeningIndex(source);
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

export function compileCodingGraph(
  source: string,
  mode: CodingGraphMode,
  language: CodingGraphLanguage = 'javascript',
): CodingGraphCompileResult {
  const input = normalizeSourceLanguage(source, language).trim();
  const diagnosticSource = language === 'javascript' ? input : source.trim();
  if (!input) {
    const diagnostic = diagnosticAt(source, 'Add a return expression to compile this source.');
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: diagnostic.message,
      diagnostic,
    };
  }

  const delimiterIssue = delimiterDiagnostic(diagnosticSource);
  if (delimiterIssue) {
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: delimiterIssue.message,
      diagnostic: delimiterIssue,
    };
  }

  const expression = extractExpression(input, mode);
  if (!expression) {
    const functionBodyIndex = functionBodyOpeningIndex(input);
    const diagnostic = diagnosticAt(
      diagnosticSource,
      /\bfunction\b|=>/i.test(input)
        ? 'No return expression found in this function.'
        : 'No graph expression found. Use return, y =, z =, or a PGFPlots addplot block.',
      functionBodyIndex >= 0 ? functionBodyIndex + 1 : 0,
    );
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: diagnostic.message,
      diagnostic,
    };
  }

  if (!/^[\w\s.+\-*/%^(),=[\]<>!?&|:'"πθ;]+$/i.test(expression)) {
    const invalidIndex = expression.search(/[^\w\s.+\-*/%^(),=[\]<>!?&|:'"πθ;]/);
    const expressionIndex = diagnosticSource.indexOf(expression);
    const diagnostic = diagnosticAt(
      diagnosticSource,
      'The source contains syntax the local graph adapter cannot compile yet.',
      expressionIndex >= 0 && invalidIndex >= 0 ? expressionIndex + invalidIndex : 0,
    );
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: diagnostic.message,
      diagnostic,
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
