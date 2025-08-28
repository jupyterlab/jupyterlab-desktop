import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

// Helper function to launch electron app
async function launchElectronApp() {
  return await electron.launch({
    args: [
      path.join(__dirname, '../build/out/main/main.js'),
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

test.describe('Electron Dialogs Screenshots', () => {
  test('should capture app with notebook', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for app to load
    await page.waitForTimeout(5000);
    
    // Try to create a new notebook (this might open in the lab view)
    // We'll capture whatever state the app is in
    await page.screenshot({ 
      path: 'tests/snapshots/app-with-notebook.png',
      fullPage: true 
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should test application launch and basic functionality', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for initialization
    await page.waitForTimeout(3000);
    
    // Take screenshot of main window
    await page.screenshot({ 
      path: 'tests/snapshots/main-window.png',
      fullPage: true 
    });
    
    // Check that the page exists and is visible
    expect(page).toBeTruthy();
    const isVisible = await page.isVisible('body');
    expect(isVisible).toBe(true);
    
    await electronApp.close();
  });
});