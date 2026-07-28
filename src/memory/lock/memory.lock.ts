import { ILock } from './lock.interface.js'

interface QueueItem {
  resolve: () => void
  reject: (error: Error) => void
}

export class MemoryLock implements ILock {
  private locks = new Map<string, { expires: number }>()
  private queues = new Map<string, QueueItem[]>()

  async acquire(taskName: string, ttlMs = 60000): Promise<boolean> {
    // Clean expired locks
    this.cleanExpired(taskName)

    const existing = this.locks.get(taskName)
    if (existing && existing.expires > Date.now()) {
      return false
    }

    this.locks.set(taskName, { expires: Date.now() + ttlMs })
    return true
  }

  async release(taskName: string): Promise<void> {
    this.locks.delete(taskName)

    // Wake up next waiting task
    const queue = this.queues.get(taskName)
    if (queue && queue.length > 0) {
      const next = queue.shift()!
      // Set the lock for the waiting task
      this.locks.set(taskName, { expires: Date.now() + 60000 })
      next.resolve()
    }
  }

  async withLock<T>(
    taskName: string,
    fn: () => Promise<T>,
    ttlMs = 60000
  ): Promise<T> {
    await this.waitForLock(taskName, ttlMs)

    try {
      return await fn()
    } finally {
      await this.release(taskName)
    }
  }

  private async waitForLock(taskName: string, ttlMs: number): Promise<void> {
    // Try to acquire immediately
    if (await this.acquire(taskName, ttlMs)) {
      return
    }

    // Wait in queue with polling
    return new Promise<void>((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // Try to acquire
        this.acquire(taskName, ttlMs).then(acquired => {
          if (acquired) {
            clearInterval(checkInterval)
            resolve()
          }
        })
      }, 10) // Check every 10ms

      // Also add to queue for release notification
      if (!this.queues.has(taskName)) {
        this.queues.set(taskName, [])
      }

      this.queues.get(taskName)!.push({
        resolve: () => {
          clearInterval(checkInterval)
          resolve()
        },
        reject: (err) => {
          clearInterval(checkInterval)
          reject(err)
        }
      })
    })
  }

  private cleanExpired(taskName: string): void {
    const existing = this.locks.get(taskName)
    if (existing && existing.expires <= Date.now()) {
      this.locks.delete(taskName)
    }
  }
}
