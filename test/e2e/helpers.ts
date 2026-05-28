import { _electron as electron, ElectronApplication } from '@playwright/test';
import { stubAllDialogs } from 'electron-playwright-helpers';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// A fresh userData dir per launch keeps tests independent. Electron's native
// --user-data-dir flag is honored because the app reads app.getPath('userData')
// (see getUserDataDir in utils) and only overrides it on Snap. Returns the app
// plus the temp userData dir so the caller can clean it up in a finally block.
// If launch fails, the temp dir is removed here so repeated runs don't
// accumulate dirs.
//
// Pass `pythonPath` to seed the app's config before launch so it treats that
// interpreter as a configured environment. Two files are written, matching the
// two seams the app reads: `app-data.json` (`pythonPath` enables the welcome
// actions; `userSetPythonEnvs` registers the env so the session registry
// resolves it) and `settings.json` (`pythonPath` is what a new session reads
// via workspace settings to boot its server).
export async function launchApp(opts?: {
  pythonPath?: string;
}): Promise<{ app: ElectronApplication; userDataDir: string }> {
  const userDataDir = mkdtempSync(join(tmpdir(), 'jlab-e2e-'));
  if (opts?.pythonPath) {
    writeFileSync(
      join(userDataDir, 'app-data.json'),
      JSON.stringify({
        pythonPath: opts.pythonPath,
        userSetPythonEnvs: [
          {
            path: opts.pythonPath,
            name: 'e2e-env',
            type: 'path',
            defaultKernel: 'python3'
          }
        ]
      })
    );
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify({ pythonPath: opts.pythonPath })
    );
  }
  try {
    const app = await electron.launch({
      args: ['.', `--user-data-dir=${userDataDir}`]
    });
    await stubAllDialogs(app);
    return { app, userDataDir };
  } catch (error) {
    cleanup(userDataDir);
    throw error;
  }
}

export function cleanup(userDataDir: string): void {
  rmSync(userDataDir, { recursive: true, force: true });
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
