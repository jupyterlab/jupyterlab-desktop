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
