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
    .replace(/\b(?:Math|math|np|numpy)\s*\.\s*/g, '')
    .replace(/Math\.PI|math\.pi|np\.pi/gi, 'pi')
    .replace(/\bdeg\s*\(([^()]*)\)/gi, '$1')
    .replace(/\b(?:Math|math)\.pow\s*\(/gi, 'pow(')
    .replace(/\*\*/g, '^')
    .replace(/^\s*(?:return|yield)\s+/i, '')
    .replace(/[;,\s]+$/g, '')
    .trim();
}

function extractExpression(source: string, mode: CodingGraphMode) {
  const addPlot = source.match(/\\addplot3?\s*(?:\[[^\]]*\])?\s*\{([\s\S]*?)\}/i)?.[1];
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

  if (!/^[\w\s.+\-*/%^(),=[\]<>!?&|:'"πθ]+$/i.test(expression)) {
    return {
      equation: mode === 'code2d' ? DEFAULT_2D : DEFAULT_3D,
      renderMode: mode === 'code2d' ? 'function' : 'implicit3d',
      error: 'The source contains syntax the local graph adapter cannot compile yet.',
    };
  }

  if (mode === 'code2d') {
    return { equation: expression, renderMode: 'function' };
  }

  const isImplicit = /\bz\b/i.test(expression) || /\b(?:field|implicit|isosurface)\b/i.test(input);
  if (isImplicit) {
    const equation = /\s=\s/.test(expression) ? expression : `${expression} = 0`;
    return { equation, renderMode: 'implicit3d' };
  }
  return { equation: `z = ${expression}`, renderMode: 'surface3d' };
}
