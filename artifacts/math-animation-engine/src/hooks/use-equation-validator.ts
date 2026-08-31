import { useEffect, useRef, useState } from 'react';
import {
  validateEquationLocally,
  type LocalValidationResult,
} from '@/lib/math-parser';

export type StudioMode = 'auto' | 'function' | 'parametric' | 'parametric3d' | 'implicit' | 'implicit3d' | 'polar' | 'vector' | 'piecewise' | 'points';

export function useEquationValidator(equation: string, mode: StudioMode) {
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const [data, setData] = useState<LocalValidationResult>();
  const [isPending, setIsPending] = useState(false);
  const [isError, setIsError] = useState(false);
  const [validatedKey, setValidatedKey] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') return;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../workers/math-validation.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;
    } catch {
      workerRef.current = null;
      return;
    }
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
        try {
          setValidatedKey(`${mode}:${trimmed}`);
          setData(validateEquationLocally(trimmed, mode));
        } catch {
          setData(undefined);
          setIsError(true);
        } finally {
          setIsPending(false);
        }
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
        try {
          setData(validateEquationLocally(trimmed, mode));
        } catch {
          setData(undefined);
          setIsError(true);
        }
        setValidatedKey(`${mode}:${trimmed}`);
        setIsPending(false);
        setIsError(false);
      };
      worker.addEventListener('message', handleMessage);
      worker.addEventListener('error', handleError, { once: true });
      try {
        worker.postMessage({ id: requestId, equation: trimmed, mode });
      } catch {
        handleError();
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [equation, mode]);

  return { data, isPending, isError, validatedKey };
}