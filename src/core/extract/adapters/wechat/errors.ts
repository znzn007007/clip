// WeChat adapter errors

export class WeChatExtractError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONTENT_NOT_FOUND' | 'PARSE_FAILED' | 'LOGIN_REQUIRED' | 'RATE_LIMITED',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'WeChatExtractError';
    Object.setPrototypeOf(this, WeChatExtractError.prototype);
  }
}
