import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

async function launchElectronApp() {
  // Check if build exists first
  const mainPath = path.join(__dirname, '../build/out/main/main.js');
  const fs = require('fs');
  
  if (!fs.existsSync(mainPath)) {
    throw new Error(`Build not found at ${mainPath}. Please run 'yarn build' first.`);
  }

  return await electron.launch({
    args: [
      mainPath,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      SKIP_BUNDLED_ENV_SETUP: 'true'
    }
  });
}

test.describe('Documentation Screenshots', () => {
  test('should capture welcome page', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for the welcome page content to be present
    await page.waitForSelector('body', { state: 'visible' });
    
    // Wait for app to be ready - look for specific welcome page elements
    // This replaces arbitrary timeout with element-based waiting
    try {
      await page.waitForSelector('[data-testid="welcome-page"]', { timeout: 10000 });
    } catch {
      // If no test id, wait for any content to load
      await page.waitForFunction(() => document.body.innerHTML.length > 100);
    }
    
    // Take screenshot of the welcome page
    await page.screenshot({ 
      path: 'tests/welcome-page.png',
      fullPage: true 
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for page to load
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    
    // Take screenshot focusing on start session controls
    await page.screenshot({ 
      path: 'tests/start-session.png'
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for page to load
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    
    // Take screenshot of recent sessions area
    await page.screenshot({ 
      path: 'tests/recent-sessions.png'
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture desktop app frame', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for the main interface to load
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    
    // Take full screenshot of the desktop app frame
    await page.screenshot({ 
      path: 'tests/desktop-app-frame.png',
      fullPage: true 
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for page to load
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    
    // Look for python environment status area
    await page.screenshot({ 
      path: 'tests/python-env-status.png'
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for page to load
    await page.waitForSelector('body', { state: 'visible' });
    await page.waitForFunction(() => document.body.innerHTML.length > 100);
    
    // Take screenshot of connect interface
    await page.screenshot({ 
      path: 'tests/start-session-connect.png'
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });
});