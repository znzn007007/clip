// src/core/render/__tests__/browser-selector.test.ts
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { BrowserSelector } from '../browser-selector.js';
import type { BrowserType } from '../../types/index.js';

describe('BrowserSelector', () => {
  let selector: BrowserSelector;

  beforeEach(() => {
    selector = new BrowserSelector();
  });

  describe('select() - 用户指定浏览器', () => {
    it('chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('chrome');
      expect(result).toBe('chrome');
    });

    it('edge 可用时应返回 edge', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('edge');
      expect(result).toBe('edge');
    });

    it('chrome 不可用时应抛 BROWSER_NOT_FOUND 异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('chrome')).rejects.toThrow('BROWSER_NOT_FOUND');
    });

    it('edge 不可用时应抛 BROWSER_NOT_FOUND 异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('edge')).rejects.toThrow('BROWSER_NOT_FOUND');
    });
  });

  describe('select() - auto 模式', () => {
    it('edge 可用时应返回 edge', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b: BrowserType) => b === 'edge');
      const result = await selector.select('auto');
      expect(result).toBe('edge');
    });

    it('edge 不可用但 chrome 可用时应返回 chrome', async () => {
      jest.spyOn(selector, 'isAvailable')
        .mockImplementation(async (b: BrowserType) => b === 'chrome');
      const result = await selector.select('auto');
      expect(result).toBe('chrome');
    });

    it('两者都可用时应返回 edge（优先级）', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select('auto');
      expect(result).toBe('edge');
    });

    it('两者都不可用时应抛异常', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(false);
      await expect(selector.select('auto')).rejects.toThrow('No supported browser found');
    });

    it('undefined 参数等同于 auto', async () => {
      jest.spyOn(selector, 'isAvailable').mockResolvedValue(true);
      const result = await selector.select();
      expect(result).toBe('edge');
    });
  });

  describe('isAvailable()', () => {
    it('应该检测浏览器是否可用', async () => {
      const result = await selector.isAvailable('chrome');
      expect(typeof result).toBe('boolean');
    });
  });
});
