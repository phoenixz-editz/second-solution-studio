import {
  validateEquationLocally,
  type LocalValidationResult,
} from '@/lib/math-parser';
import type { StudioMode } from '@/hooks/use-equation-validator';
import { z } from 'zod';

type ValidationRequest = {
  id: number;
  equation: string;
  mode: StudioMode;
};

type ValidationResponse = {
  id: number;
  result: LocalValidationResult;
};

self.onmessage = (event: MessageEvent<ValidationRequest>) => {
  const { id, equation, mode } = event.data;

  const response: ValidationResponse = {
    id,
    result: validateEquationLocally(equation, mode),
  };
  const validated = z.object({
    id: z.number(),
    result: z.object({
      valid: z.boolean(),
      mode: z.string(),
      animatable: z.boolean(),
      hasTimeVariable: z.boolean(),
      supports2dFallback: z.boolean(),
      verificationStatus: z.enum(['static', 'dynamic', 'invalid']),
      verificationMessage: z.string(),
      normalized: z.string(),
      error: z.string().nullable(),
      suggestions: z.array(z.string()),
      variables: z.array(z.string()),
    }),
  }).parse(response);
  self.postMessage(validated);
};