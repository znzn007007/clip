// src/core/extract/adapters/wechat/__tests__/errors.test.ts
import { describe, it, expect } from '@jest/globals';
import { WeChatExtractError } from '../errors.js';

describe('WeChatExtractError', () => {
  it('should create error with CONTENT_NOT_FOUND code', () => {
    const error = new WeChatExtractError('Content not found', 'CONTENT_NOT_FOUND');

    expect(error).toBeInstanceOf(WeChatExtractError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('WeChatExtractError');
    expect(error.message).toBe('Content not found');
    expect(error.code).toBe('CONTENT_NOT_FOUND');
    expect(error.cause).toBeUndefined();
  });

  it('should create error with PARSE_FAILED code', () => {
    const error = new WeChatExtractError('Failed to parse HTML', 'PARSE_FAILED');

    expect(error.name).toBe('WeChatExtractError');
    expect(error.code).toBe('PARSE_FAILED');
    expect(error.message).toBe('Failed to parse HTML');
  });

  it('should create error with LOGIN_REQUIRED code', () => {
    const error = new WeChatExtractError('Login required', 'LOGIN_REQUIRED');

    expect(error.code).toBe('LOGIN_REQUIRED');
    expect(error.message).toBe('Login required');
  });

  it('should create error with RATE_LIMITED code', () => {
    const error = new WeChatExtractError('Rate limited', 'RATE_LIMITED');

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.message).toBe('Rate limited');
  });

  it('should create error with cause', () => {
    const cause = new Error('Network error');
    const error = new WeChatExtractError('Extraction failed', 'PARSE_FAILED', cause);

    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Extraction failed');
  });

  it('should have correct prototype chain', () => {
    const error = new WeChatExtractError('Test', 'PARSE_FAILED');

    expect(error instanceof WeChatExtractError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it('should have stack trace', () => {
    const error = new WeChatExtractError('Test error', 'CONTENT_NOT_FOUND');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('WeChatExtractError');
  });
});
