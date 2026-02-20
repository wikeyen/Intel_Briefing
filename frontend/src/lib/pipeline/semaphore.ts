// ABOUTME: Counting semaphore for limiting async concurrency.
// ABOUTME: Provides acquire/release and a convenience run() method.

/**
 * A counting semaphore that limits the number of concurrent async operations.
 * Use `acquire()` for manual control or `run()` for automatic scoping.
 */
export class Semaphore {
  private permits: number
  private queue: Array<() => void> = []

  constructor(concurrency: number) {
    if (concurrency < 1) throw new Error('Semaphore concurrency must be >= 1')
    this.permits = concurrency
  }

  /**
   * Acquire a permit. Resolves with a release function when a slot is available.
   * The caller MUST call the returned function to release the permit.
   */
  acquire(): Promise<() => void> {
    if (this.permits > 0) {
      this.permits--
      return Promise.resolve(() => this.release())
    }
    return new Promise<() => void>(resolve => {
      this.queue.push(() => {
        this.permits--
        resolve(() => this.release())
      })
    })
  }

  private release(): void {
    this.permits++
    if (this.queue.length > 0) {
      const next = this.queue.shift()!
      next()
    }
  }

  /**
   * Run an async function within a semaphore-guarded slot.
   * The permit is automatically released when the function completes or throws.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.acquire()
    try {
      return await fn()
    } finally {
      release()
    }
  }
}
