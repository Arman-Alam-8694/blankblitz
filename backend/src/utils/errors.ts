/** An error whose message is safe to show to the client. Anything else is reported generically. */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new GameError(message);
}
