import { useEffect, useRef, useState } from 'react';
import {
  validateEquationLocally,
  type LocalValidationResult,
} from '@/lib/math-parser';

export type StudioMode = 'auto' | 'function' | 'parametric' | 'implicit' | 'implicit3d' | 'polar' | 'vector' | 'piecewise' | 'points';

export function useEquationValidator(equation: string, mode: StudioMode) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [data, setData] = useState<LocalValidationResult>();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [validatedKey, setValidatedKey] = useState('');

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
    const requestId = ++requestIdRef.current;
    setIsPending(Boolean(trimmed));
    setIsError(false);
    setData(undefined);
    setValidatedKey('');
    if (!trimmed) return;
    const timer = window.setTimeout(() => {
      const worker = workerRef.current;
      if (!worker) {
        setValidatedKey(`${mode}:${trimmed}`);
        setData(validateEquationLocally(trimmed, mode));
        setIsPending(false);
        return;
      }

      const handleMessage = (event: MessageEvent<{ id: number; result: LocalValidationResult }>) => {
        if (event.data.id !== requestId || requestId !== requestIdRef.current) return;
        worker.removeEventListener('message', handleMessage);
        worker.removeEventListener('error', handleError);
        setValidatedKey(`${mode}:${trimmed}`);
        setData(event.data.result);
        setIsPending(false);
      };
      const handleError = () => {
        if (requestId !== requestIdRef.current) return;
        worker.removeEventListener('message', handleMessage);
        setData(validateEquationLocally(trimmed, mode));
        setValidatedKey(`${mode}:${trimmed}`);
        setIsPending(false);
        setIsError(false);
      };
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError, { once: true });
      worker.postMessage({ id: requestId, equation: trimmed, mode });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [equation, mode]);

  return { data, isPending, isError, validatedKey };
}