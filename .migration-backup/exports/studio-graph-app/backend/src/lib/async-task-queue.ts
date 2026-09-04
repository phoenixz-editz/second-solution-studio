type Task<T> = {
  run: () => T | Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

export class AsyncTaskQueue {
  private readonly pending: Task<unknown>[] = [];
  private active = 0;

  constructor(private readonly concurrency = 4, private readonly maxPending = 200) {}

  enqueue<T>(run: () => T | Promise<T>) {
    if (this.pending.length >= this.maxPending) {
      return Promise.reject(new Error("Math verification queue is busy. Try again shortly."));
    }
    return new Promise<T>((resolve, reject) => {
      this.pending.push({ run, resolve, reject } as Task<unknown>);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.concurrency && this.pending.length > 0) {
      const task = this.pending.shift();
      if (!task) return;
      this.active += 1;
      setImmediate(async () => {
        try {
          task.resolve(await task.run());
        } catch (error) {
          task.reject(error);
        } finally {
          this.active -= 1;
          this.drain();
        }
      });
    }
  }
}
