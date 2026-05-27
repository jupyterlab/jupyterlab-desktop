import { _electron as electron, ElectronApplication } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// A fresh JLAB_DESKTOP_HOME per launch keeps tests independent. Returns the app
// plus the temp dir so the caller can clean it up in a finally block.
export async function launchApp(): Promise<{
  app: ElectronApplication;
  home: string;
}> {
  const home = mkdtempSync(join(tmpdir(), 'jlab-e2e-'));
  const app = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      JLAB_DESKTOP_HOME: home,
      ELECTRON_IS_TEST: '1'
    }
  });
  await stubAllDialogs(app);
  return { app, home };
}

export function cleanup(home: string): void {
  rmSync(home, { recursive: true, force: true });
}

// The app opens several windows (titlebar, welcome, session, manager) and most
// have an empty title, so firstWindow() is ambiguous. Poll windows() and match
// on the page title instead. Post Electron 30 a WebContentsView also surfaces
// as its own page here, so title matching stays the reliable selector.
export async function pageByTitle(
  app: ElectronApplication,
  pattern: RegExp,
  timeout = 15000
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of app.windows()) {
      try {
        if (pattern.test(await page.title())) {
          return page;
        }
      } catch {
        // page may be mid-navigation; retry on the next pass
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`no window title matched ${pattern}`);
}
