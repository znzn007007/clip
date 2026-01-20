// src/core/__tests__/errors.test.ts
import { describe, it, expect } from '@jest/globals';
import { ClipError, createExportResult } from '../errors.js';
import { ErrorCode } from '../export/types.js';

describe('ClipError', () => {
  it('should create error with all properties', () => {
    const error = new ClipError(
      ErrorCode.NETWORK_ERROR,
      'Network connection failed',
      true,
      'Check your internet connection',
      { url: 'https://example.com' }
    );

    expect(error).toBeInstanceOf(ClipError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ClipError');
    expect(error.code).toBe(ErrorCode.NETWORK_ERROR);
    expect(error.message).toBe('Network connection failed');
    expect(error.retryable).toBe(true);
    expect(error.suggestion).toBe('Check your internet connection');
    expect(error.context).toEqual({ url: 'https://example.com' });
  });

  it('should create error with minimal properties', () => {
    const error = new ClipError(ErrorCode.EXTRACT_FAILED, 'Extract failed');

    expect(error.name).toBe('ClipError');
    expect(error.code).toBe(ErrorCode.EXTRACT_FAILED);
    expect(error.message).toBe('Extract failed');
    expect(error.retryable).toBe(false);
    expect(error.suggestion).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it('should have correct stack trace', () => {
    const error = new ClipError(ErrorCode.NETWORK_ERROR, 'Test error');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('ClipError');
  });
});

describe('createExportResult', () => {
  it('should create failed export result from error', () => {
    const error = new ClipError(
      ErrorCode.ASSET_DOWNLOAD_FAILED,
      'Failed to download image',
      true,
      'Check URL validity',
      { assetUrl: 'https://example.com/image.png' }
    );

    const result = createExportResult(error);

    expect(result.status).toBe('failed');
    expect(result.platform).toBe('unknown');
    expect(result.diagnostics?.warnings).toEqual([]);
    expect(result.diagnostics?.error).toEqual({
      code: ErrorCode.ASSET_DOWNLOAD_FAILED,
      message: 'Failed to download image',
      retryable: true,
      suggestion: 'Check URL validity',
    });
  });

  it('should handle error without suggestion', () => {
    const error = new ClipError(ErrorCode.EXTRACT_FAILED, 'Extract failed');
    const result = createExportResult(error);

    expect(result.status).toBe('failed');
    expect(result.diagnostics?.error?.suggestion).toBeUndefined();
  });

  it('should handle error without context', () => {
    const error = new ClipError(ErrorCode.TIMEOUT, 'Request timeout', false);
    const result = createExportResult(error);

    expect(result.status).toBe('failed');
    expect(result.diagnostics?.error?.retryable).toBe(false);
  });
});
