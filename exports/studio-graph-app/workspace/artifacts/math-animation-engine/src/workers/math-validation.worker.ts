import {
  buildGraphEvaluator,
  detectSmartMode,
  normalizeForPreview,
  type ResolvedStudioMode,
} from '@/lib/math-parser';
import type { StudioMode } from '@/hooks/use-equation-validator';

type ValidationRequest = {
  id: number;
  equation: string;
  mode: StudioMode;
};

type ValidationResponse = {
  id: number;
  valid: boolean;
  resolvedMode: ResolvedStudioMode;
  normalized: string;
};

self.onmessage = (event: MessageEvent<ValidationRequest>) => {
  const { id, equation, mode } = event.data;
  const normalized = normalizeForPreview(equation);
  const resolvedMode = mode === 'auto' ? detectSmartMode(normalized) : mode;
  const valid = Boolean(normalized && buildGraphEvaluator(normalized, resolvedMode));

  const response: ValidationResponse = {
    id,
    valid,
    resolvedMode,
    normalized,
  };
  self.postMessage(response);
};