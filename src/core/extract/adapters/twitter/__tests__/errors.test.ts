import { describe, it, expect } from '@jest/globals';
import { TwitterExtractError, TWITTER_ERROR_TYPES } from '../errors.js';

describe('Twitter errors', () => {
  it('exposes error type constants', () => {
    expect(TWITTER_ERROR_TYPES.NO_TWEETS_FOUND).toBe('NO_TWEETS_FOUND');
    expect(TWITTER_ERROR_TYPES.PARSE_FAILED).toBe('PARSE_FAILED');
  });

  it('creates TwitterExtractError with code and cause', () => {
    const cause = new Error('boom');
    const error = new TwitterExtractError('message', 'NO_TWEETS', cause);

    expect(error.name).toBe('TwitterExtractError');
    expect(error.code).toBe('NO_TWEETS');
    expect(error.cause).toBe(cause);
  });
});
