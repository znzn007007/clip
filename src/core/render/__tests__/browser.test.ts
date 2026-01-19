import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BrowserManager } from '../browser.js';
import { chromium } from 'playwright';
import * as fs from 'fs/promises';
import * as os from 'os';
import { ClipError } from '../../errors.js';
import { ErrorCode } from '../../export/types.js';

jest.mock('playwright', () => ({
  chromium: {
    launchPersistentContext: jest.fn(),
  },
}));

jest.mock('fs/promises');

describe('BrowserManager', () => {
  const launchMock = chromium.launchPersistentContext as unknown as jest.Mock;
  const mkdirMock = fs.mkdir as unknown as jest.Mock;
  const accessMock = fs.access as unknown as jest.Mock;

  const mockResolved = <T>(value: T) => {
    return jest.fn(() => Promise.resolve(value)) as jest.Mock;
  };

  let consoleSpy: jest.SpiedFunction<typeof console.error>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    mkdirMock.mockImplementation(() => Promise.resolve());
    accessMock.mockImplementation(() => Promise.reject(new Error('not found')));
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    jest.restoreAllMocks();
  });

  it('launches a persistent context and reuses it', async () => {
    const context = {
      cookies: mockResolved([]),
      close: mockResolved(undefined),
    };

    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    const first = await manager.launch('https://example.com');
    const second = await manager.launch('https://example.com');

    expect(first).toBe(context);
    expect(second).toBe(context);
    expect(launchMock).toHaveBeenCalledTimes(1);
  });

  it('checks twitter cookies when target is twitter', async () => {
    const context = {
      cookies: mockResolved([{ name: 'auth_token', domain: 'x.com' }]),
      close: mockResolved(undefined),
      pages: jest.fn().mockReturnValue([]),
    };

    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    await manager.launch('https://x.com/status/1');

    expect(context.cookies).toHaveBeenCalled();
    expect(context.pages).not.toHaveBeenCalled();
  });

  it('logs when Edge cookies file exists', async () => {
    accessMock.mockImplementation(() => Promise.resolve());

    const context = {
      close: mockResolved(undefined),
    };

    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    await manager.launch('https://example.com');

    const platform = os.platform();
    const shouldHavePath = ['win32', 'darwin', 'linux'].includes(platform);

    if (shouldHavePath) {
      expect(accessMock).toHaveBeenCalledTimes(1);
      const logs = consoleSpy.mock.calls.flat().join(' ');
      expect(logs).toContain('Found Edge cookies');
    } else {
      expect(accessMock).not.toHaveBeenCalled();
    }
  });

  it('prompts login when twitter cookies are missing', async () => {
    const cookiesMock = jest.fn() as jest.Mock;
    cookiesMock.mockImplementationOnce(() => Promise.resolve([]));
    cookiesMock.mockImplementationOnce(() => Promise.resolve([{ name: 'auth_token', domain: 'x.com' }]));

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
    };

    const context = {
      cookies: cookiesMock,
      close: mockResolved(undefined),
      pages: jest.fn().mockReturnValue([]),
      newPage: jest.fn(() => Promise.resolve(page)),
    };

    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    await manager.launch('https://x.com/status/1');

    expect(context.newPage).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith('https://x.com');
    expect(page.waitForTimeout).toHaveBeenCalledTimes(1);
    const logs = consoleSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('Login detected');
  });

  it('warns when login is not detected in time', async () => {
    const cookiesMock = jest.fn(() => Promise.resolve([])) as jest.Mock;

    const page = {
      goto: mockResolved(undefined),
      waitForTimeout: mockResolved(undefined),
    };

    const context = {
      cookies: cookiesMock,
      close: mockResolved(undefined),
      pages: jest.fn().mockReturnValue([]),
      newPage: jest.fn(() => Promise.resolve(page)),
    };

    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    await manager.launch('https://x.com/status/1');

    expect(page.waitForTimeout).toHaveBeenCalledTimes(60);
    const logs = consoleSpy.mock.calls.flat().join(' ');
    expect(logs).toContain('Login not detected within timeout');
  });

  it('throws ClipError when session dir cannot be created', async () => {
    mkdirMock.mockImplementation(() => Promise.reject(new Error('nope')));

    const manager = new BrowserManager('C:/bad/session');
    await expect(manager.launch('https://example.com')).rejects.toBeInstanceOf(ClipError);

    await expect(manager.launch('https://example.com')).rejects.toMatchObject({
      code: ErrorCode.EXPORT_FAILED,
    });
  });

  it('closes context and clears state', async () => {
    const context = {
      cookies: mockResolved([]),
      close: mockResolved(undefined),
    };
    launchMock.mockImplementation(() => Promise.resolve(context));

    const manager = new BrowserManager('C:/tmp/session');
    await manager.launch('https://example.com');

    await manager.close();

    expect(context.close).toHaveBeenCalledTimes(1);
    expect(manager.getContext()).toBeUndefined();
  });
});
