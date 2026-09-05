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
  try {
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
  } catch (error: unknown) {
    self.postMessage({
      id,
      result: {
        valid: false,
        mode: mode === 'code2d' ? 'function' : mode === 'code3d' ? 'implicit3d' : mode,
        animatable: false,
        hasTimeVariable: false,
        supports2dFallback: true,
        verificationStatus: 'invalid',
        verificationMessage: error instanceof Error ? error.message : 'The expression could not be validated safely.',
        normalized: equation,
        error: error instanceof Error ? error.message : 'The expression could not be validated safely.',
        suggestions: ['Finish the current expression', 'Use finite bounds for loops and series'],
        variables: [],
      },
    });
  }
};