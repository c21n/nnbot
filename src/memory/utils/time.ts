export function now(): number {
  return Date.now()
}

export function daysSince(timestamp: number): number {
  return (Date.now() - timestamp) / (1000 * 60 * 60 * 24)
}

export function hoursSince(timestamp: number): number {
  return (Date.now() - timestamp) / (1000 * 60 * 60)
}

export function secondsSince(timestamp: number): number {
  return (Date.now() - timestamp) / 1000
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
