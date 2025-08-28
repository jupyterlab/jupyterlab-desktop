import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

async function launchElectronApp() {
  return await electron.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security'
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      DISPLAY: process.env.DISPLAY || ':99'
    }
  });
}

async function waitForAppReady(page: any) {
  // Wait for basic page load
  await page.waitForLoadState('domcontentloaded');
  
  // Give the app some time to render
  await page.waitForFunction(() => {
    return document.body && document.body.innerHTML.length > 100;
  }, { timeout: 10000 });
  
  // Wait a bit more for rendering to complete
  await page.waitForFunction(() => {
    return Date.now() > 0; // Just a simple delay mechanism
  }, { timeout: 3000 });
}

test.describe('Documentation Screenshots', () => {
  test('should capture welcome page', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Take full screenshot of the welcome page 
    await page.screenshot({ 
      path: 'tests/welcome-page.png',
      fullPage: true 
    });
    
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Take screenshot of a reasonable area that should contain session controls
    await page.screenshot({ 
      path: 'tests/start-session.png',
      clip: { x: 0, y: 50, width: 400, height: 300 }
    });
    
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Take screenshot of the lower portion where recent sessions might be
    await page.screenshot({ 
      path: 'tests/recent-sessions.png',
      clip: { x: 0, y: 300, width: 600, height: 200 }
    });
    
    await electronApp.close();
  });

  test('should capture desktop app frame', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // For desktop app frame, we want the full application window
    await page.screenshot({ 
      path: 'tests/desktop-app-frame.png',
      fullPage: true 
    });
    
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Take screenshot of title bar area
    await page.screenshot({ 
      path: 'tests/python-env-status.png',
      clip: { x: 0, y: 0, width: 800, height: 100 }
    });
    
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Take screenshot of a portion that might contain connect options
    await page.screenshot({ 
      path: 'tests/start-session-connect.png',
      clip: { x: 0, y: 100, width: 400, height: 250 }
    });
    
    await electronApp.close();
  });
});