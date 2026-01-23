// src/core/render/browser-selector.ts
import { chromium } from 'playwright';
import { ClipError } from '../errors.js';
import { ErrorCode } from '../export/types.js';
import type { BrowserType } from '../types/index.js';

export class BrowserSelector {
  /**
   * 根据用户选择返回浏览器类型
   * - 用户指定：返回指定的，不可用则抛异常
   * - auto/undefined：按优先级返回第一个可用的
   */
  async select(browserType?: BrowserType): Promise<BrowserType> {
    // 用户指定浏览器
    if (browserType === 'chrome' || browserType === 'edge') {
      if (!(await this.isAvailable(browserType))) {
        const browserName = browserType === 'chrome' ? 'Google Chrome' : 'Microsoft Edge';
        throw new ClipError(
          ErrorCode.BROWSER_NOT_FOUND,
          `[${ErrorCode.BROWSER_NOT_FOUND}] Browser '${browserType}' is not available on this system`,
          false,
          `Install ${browserName} or use --browser auto`
        );
      }
      return browserType;
    }

    // auto 模式：按优先级尝试
    for (const type of this.getAutoPriority()) {
      if (await this.isAvailable(type)) {
        return type;
      }
    }

    // 都不可用
    throw new ClipError(
      ErrorCode.BROWSER_NOT_FOUND,
      'No supported browser found',
      false,
      'Install Google Chrome or Microsoft Edge'
    );
  }

  /**
   * 自动模式的优先级：edge -> chrome
   */
  private getAutoPriority(): BrowserType[] {
    return ['edge', 'chrome'];
  }

  /**
   * 检查浏览器是否可用
   * 通过尝试启动浏览器来检测（立即关闭）
   */
  async isAvailable(browserType: BrowserType): Promise<boolean> {
    const channel = browserType === 'chrome' ? 'chrome' : 'msedge';
    try {
      const browser = await chromium.launch({
        channel,
        headless: true,
      });
      await browser.close();
      return true;
    } catch {
      return false;
    }
  }
}
