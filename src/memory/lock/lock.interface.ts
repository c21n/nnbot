export interface ILock {
  acquire(taskName: string, ttlMs?: number): Promise<boolean>
  release(taskName: string): Promise<void>
  withLock<T>(taskName: string, fn: () => Promise<T>, ttlMs?: number): Promise<T>
}

/** @deprecated Use ILock instead */
export type Lock = ILock
