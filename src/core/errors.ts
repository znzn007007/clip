// src/core/errors.ts
import { ErrorCode } from './export/types.js';

export class ClipError extends Error {
  code: ErrorCode;
  retryable: boolean;
  suggestion?: string;
  context?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    retryable: boolean = false,
    suggestion?: string,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ClipError';
    this.code = code;
    this.retryable = retryable;
    this.suggestion = suggestion;
    this.context = context;
  }
}

export function createExportResult(error: ClipError): Omit<import('./export/types.js').ExportResult, 'status'> & { status: 'failed' } {
  return {
    status: 'failed',
    platform: 'unknown',
    diagnostics: {
      warnings: [],
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        suggestion: error.suggestion,
      },
    },
  };
}
