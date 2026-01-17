export class TwitterExtractError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_TWEETS' | 'PARSE_FAILED' | 'INCOMPLETE_DATA',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TwitterExtractError';
    Object.setPrototypeOf(this, TwitterExtractError.prototype);
  }
}
