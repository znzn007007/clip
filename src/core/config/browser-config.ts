// src/core/config/browser-config.ts
import * as path from 'path';
import * as os from 'os';
import type { BrowserConfig, BrowserType, ConfigurableBrowser } from '../types/index.js';

export const BROWSER_CONFIGS: Record<ConfigurableBrowser, BrowserConfig> = {
  edge: {
    channel: 'msedge',
    name: 'Microsoft Edge',
    sessionDir: 'session-edge',
    cookiesPath: (platform: NodeJS.Platform) => {
      const homedir = os.homedir();
      switch (platform) {
        case 'win32':
          return path.join(homedir, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies');
        case 'darwin':
          return path.join(homedir, 'Library', 'Application Support', 'Microsoft Edge', 'Default', 'Cookies');
        case 'linux':
          return path.join(homedir, '.config', 'microsoft-edge', 'Default', 'Cookies');
        default:
          return null;
      }
    },
  },
  chrome: {
    channel: 'chrome',
    name: 'Google Chrome',
    sessionDir: 'session-chrome',
    cookiesPath: (platform: NodeJS.Platform) => {
      const homedir = os.homedir();
      switch (platform) {
        case 'win32':
          return path.join(homedir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies');
        case 'darwin':
          return path.join(homedir, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Cookies');
        case 'linux':
          return path.join(homedir, '.config', 'google-chrome', 'Default', 'Cookies');
        default:
          return null;
      }
    },
  },
};

export const DEFAULT_BROWSER: BrowserType = 'auto';
