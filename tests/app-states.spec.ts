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

test.describe('JupyterLab Desktop UI Testing', () => {
  test('should capture different application states', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for app to fully load
    await page.waitForTimeout(8000);
    
    // Capture the initial state - could be welcome screen or main interface
    await page.screenshot({ 
      path: 'tests/snapshots/app-initial-state.png',
      fullPage: true 
    });
    
    // Try to capture different window states
    // Take a few screenshots with different wait times to capture any dynamic loading
    await page.waitForTimeout(2000);
    await page.screenshot({ 
      path: 'tests/snapshots/app-state-2.png',
      fullPage: true 
    });
    
    await page.waitForTimeout(3000);
    await page.screenshot({ 
      path: 'tests/snapshots/app-state-3.png',
      fullPage: true 
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should test app dimensions and basic properties', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Wait for initialization
    await page.waitForTimeout(5000);
    
    // Get window properties
    const windowBounds = await electronApp.windows()[0].evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        title: document.title
      };
    });
    
    // Take screenshot with window info
    await page.screenshot({ 
      path: 'tests/snapshots/app-window-properties.png',
      fullPage: true 
    });
    
    expect(windowBounds.width).toBeGreaterThan(0);
    expect(windowBounds.height).toBeGreaterThan(0);
    
    await electronApp.close();
  });

  test('should capture app in different loading phases', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    // Take screenshot immediately after launch
    await page.waitForTimeout(1000);
    await page.screenshot({ 
      path: 'tests/snapshots/app-early-launch.png',
      fullPage: true 
    });
    
    // Wait a bit more and take another
    await page.waitForTimeout(5000);
    await page.screenshot({ 
      path: 'tests/snapshots/app-mid-launch.png',
      fullPage: true 
    });
    
    // Final state
    await page.waitForTimeout(10000);
    await page.screenshot({ 
      path: 'tests/snapshots/app-fully-loaded.png',
      fullPage: true 
    });
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });
});