export const TWITTER_ERROR_TYPES = {
  NOT_LOGGED_IN: 'NOT_LOGGED_IN',
  NO_TWEETS_FOUND: 'NO_TWEETS_FOUND',
  RAW_DATA_PARSE_FAILED: 'RAW_DATA_PARSE_FAILED',
  DOM_EXTRACT_FAILED: 'DOM_EXTRACT_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  NO_TWEETS: 'NO_TWEETS',
} as const;

export type TwitterErrorCode = 'NO_TWEETS' | 'PARSE_FAILED' | 'INCOMPLETE_DATA';

export class TwitterExtractError extends Error {
  constructor(
    message: string,
    public readonly code: TwitterErrorCode,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'TwitterExtractError';
    Object.setPrototypeOf(this, TwitterExtractError.prototype);
  }
}
