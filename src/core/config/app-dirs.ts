import os from 'node:os';
import path from 'node:path';

export function getAppDataDir(appName: string): string {
  const platform = process.platform;
  if (platform === 'win32') {
    const base = process.env.LOCALAPPDATA || process.env.APPDATA;
    if (base) {
      return path.join(base, appName);
    }
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName);
  }

  const xdgDataHome = process.env.XDG_DATA_HOME;
  if (xdgDataHome) {
    return path.join(xdgDataHome, appName);
  }

  return path.join(os.homedir(), '.local', 'share', appName);
}
