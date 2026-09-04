import { useEffect, useRef, useState } from 'react';
import { useValidateEquation } from '@workspace/api-client-react';

export type StudioMode = 'auto' | 'function' | 'parametric' | 'implicit' | 'implicit3d' | 'polar' | 'vector' | 'piecewise' | 'points';

export function useEquationValidator(equation: string, mode: StudioMode) {
  const mutation = useValidateEquation({
    mutation: {
      retry: 2,
      retryDelay: (attempt) => Math.min(250 * (attempt + 1), 1000),
    },
  });
  const mutateRef = useRef(mutation.mutate);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [validatedKey, setValidatedKey] = useState('');
  mutateRef.current = mutation.mutate;

  useEffect(() => {
    const worker = new Worker(
      new URL('../workers/math-validation.worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const trimmed = equation.trim();
    setValidatedKey('');
    if (!trimmed) return;
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) {
        setValidatedKey(`${mode}:${trimmed}`);
        mutateRef.current({ data: { equation: trimmed, mode } });
        return;
      }

      const handleMessage = (event: MessageEvent<{ id: number }>) => {
        if (event.data.id !== requestId || requestId !== requestIdRef.current) return;
        worker.removeEventListener('message', handleMessage);
        setValidatedKey(`${mode}:${trimmed}`);
        mutateRef.current({ data: { equation: trimmed, mode } });
      };
      worker.addEventListener('message', handleMessage);
      worker.postMessage({ id: requestId, equation: trimmed, mode });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [equation, mode]);

  return { ...mutation, validatedKey };
}