export class PackError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'PackError'
  }
}
