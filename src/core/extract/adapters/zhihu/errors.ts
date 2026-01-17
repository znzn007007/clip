// Zhihu adapter errors

export class ZhihuExtractError extends Error {
  constructor(
    message: string,
    public readonly code: 'CONTENT_NOT_FOUND' | 'PARSE_FAILED' | 'LOGIN_REQUIRED' | 'RATE_LIMITED',
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'ZhihuExtractError';
    Object.setPrototypeOf(this, ZhihuExtractError.prototype);
  }
}
