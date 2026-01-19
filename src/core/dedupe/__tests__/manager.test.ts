// src/core/dedupe/__tests__/manager.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { DedupeManager } from '../manager.js';
import type { ClipDoc } from '../../types/index.js';
import type { ArchiveDatabase } from '../types.js';

// Mock file system
jest.mock('fs/promises');
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}));

describe('DedupeManager', () => {
  const testOutputDir = '/test/output';

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(false);
  });

  it('首次加载时文件不存在应创建空数据库', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.version).toBe(1);
    expect(db.archived).toEqual({});
  });

  it('加载现有数据库', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(true);

    const mockFs = require('fs/promises');
    const existingDb: ArchiveDatabase = {
      version: 1,
      archived: {
        'https://x.com/123': {
          firstSeen: '2026-01-19T00:00:00Z',
          lastUpdated: '2026-01-19T00:00:00Z',
          path: './twitter/2026/01/19/abc/',
          platform: 'twitter',
        },
      },
    };
    mockFs.readFile = jest.fn().mockResolvedValue(JSON.stringify(existingDb));

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.archived['https://x.com/123']).toBeDefined();
  });

  it('检查 URL 是否已归档（用 URL 预检查）', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    await manager.addRecordByUrl('https://x.com/123', {
      firstSeen: '2026-01-19T00:00:00Z',
      lastUpdated: '2026-01-19T00:00:00Z',
      path: './twitter/2026/01/19/abc/',
      platform: 'twitter',
    });

    const result = await manager.checkByUrl('https://x.com/123');
    expect(result.isArchived).toBe(true);
    expect(result.record?.path).toBe('./twitter/2026/01/19/abc/');
  });

  it('添加归档记录', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/123',
      canonicalUrl: 'https://x.com/123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };

    await manager.addRecord(doc, './twitter/2026/01/19/abc/');

    const result = await manager.checkByDoc(doc);
    expect(result.isArchived).toBe(true);
  });

  it('删除记录', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    await manager.addRecordByUrl('https://x.com/123', {
      firstSeen: '2026-01-19T00:00:00Z',
      lastUpdated: '2026-01-19T00:00:00Z',
      path: './twitter/2026/01/19/abc/',
      platform: 'twitter',
    });

    await manager.removeRecord('https://x.com/123');

    const result = await manager.checkByUrl('https://x.com/123');
    expect(result.isArchived).toBe(false);
  });

  it('should handle corrupted database file and create backup', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(true);

    const mockFs = require('fs/promises');
    mockFs.readFile = jest.fn().mockRejectedValue(new Error('Invalid JSON'));
    mockFs.rename = jest.fn().mockResolvedValue(undefined);

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.version).toBe(1);
    expect(db.archived).toEqual({});
    expect(mockFs.rename).toHaveBeenCalled();
  });

  it('should handle backup failure gracefully', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(true);

    const mockFs = require('fs/promises');
    mockFs.readFile = jest.fn().mockRejectedValue(new Error('Invalid JSON'));
    mockFs.rename = jest.fn().mockRejectedValue(new Error('Rename failed'));

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const db = manager.getDatabase();
    expect(db.version).toBe(1);
    expect(db.archived).toEqual({});
  });

  it('should not reload if already loaded', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(false);

    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    // Second load should be a no-op
    await manager.load();

    // Should still have empty database
    const db = manager.getDatabase();
    expect(db.archived).toEqual({});
  });

  it('should check unarchived URL', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const result = await manager.checkByUrl('https://x.com/not-archived');
    expect(result.isArchived).toBe(false);
    expect(result.record).toBeUndefined();
  });

  it('should check unarchived document', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/not-archived',
      canonicalUrl: 'https://x.com/not-archived',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };

    const result = await manager.checkByDoc(doc);
    expect(result.isArchived).toBe(false);
    expect(result.record).toBeUndefined();
  });

  it('should ensure loaded before operations', async () => {
    const { existsSync } = require('fs');
    existsSync.mockReturnValue(false);

    const manager = new DedupeManager(testOutputDir);

    // Directly call checkByUrl without explicit load
    const result = await manager.checkByUrl('https://x.com/test');
    expect(result.isArchived).toBe(false);
  });

  it('should use canonical URL for dedupe key when available', async () => {
    const manager = new DedupeManager(testOutputDir);
    await manager.load();

    const doc: ClipDoc = {
      platform: 'twitter',
      sourceUrl: 'https://x.com/123?hash=removed',
      canonicalUrl: 'https://x.com/123',
      title: 'Test',
      fetchedAt: '2026-01-19T00:00:00Z',
      blocks: [],
      assets: { images: [] },
    };

    await manager.addRecord(doc, './twitter/2026/01/19/abc/');

    // Check with different URL but same canonical
    const result = await manager.checkByUrl('https://x.com/123?different=param');
    expect(result.isArchived).toBe(true);
  });
});
