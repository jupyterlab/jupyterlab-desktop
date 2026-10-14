import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cleanup, launchApp } from './helpers';

test('a legacy remote token is not retained in application data', async () => {
  const token = 'e2e-remote-token';
  const { app, userDataDir, jupyterDir } = await launchApp({
    appData: {
      recentSessions: [
        {
          remoteURL: `https://example.com/lab?token=${token}`,
          persistSessionData: true,
          partition: 'persist:e2e',
          date: new Date().toISOString()
        }
      ],
      recentRemoteURLs: [
        {
          url: `https://example.com/lab?token=${token}`,
          date: new Date().toISOString()
        }
      ]
    }
  });
  try {
    await app.firstWindow();
  } finally {
    await app.close();
  }
  try {
    expect(
      readFileSync(join(userDataDir, 'app-data.json'), 'utf8')
    ).not.toContain(token);
  } finally {
    cleanup(userDataDir, jupyterDir);
  }
});

// The recents list is capped at 20 rows and the welcome page can delete a row,
// while the dialog list is neither capped nor touched by that, so a token can
// survive in the dialog list alone. Reading strips it in memory; the first
// launch has to write that back itself. The file is read while the app is
// still running, because the save at quit would hide a missing startup save.
test('a legacy token held only by the dialog list is removed by the first launch', async () => {
  const token = 'e2e-dialog-list-token';
  const { app, userDataDir, jupyterDir } = await launchApp({
    appData: {
      recentRemoteURLs: [
        {
          url: `https://example.com/lab?token=${token}`,
          date: new Date().toISOString()
        }
      ]
    }
  });
  try {
    await app.firstWindow();
    expect(
      readFileSync(join(userDataDir, 'app-data.json'), 'utf8')
    ).not.toContain(token);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
