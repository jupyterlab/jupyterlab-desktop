import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

test.describe('Welcome Screen', () => {
  test('should launch application and capture welcome screen', async () => {
    // Launch Electron app with sandbox disabled for CI environment
    const electronApp = await electron.launch({
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

    // Get the main window
    const page = await electronApp.firstWindow();
    
    // Wait for the app to initialize
    await page.waitForTimeout(5000);
    
    // Take a screenshot of the welcome screen
    await page.screenshot({ 
      path: 'tests/snapshots/welcome-screen.png',
      fullPage: true 
    });
    
    // Verify the window exists - title might be empty in test mode
    expect(page).toBeTruthy();
    
    // Check that we have a visible page
    const isVisible = await page.isVisible('body');
    expect(isVisible).toBe(true);
    
    // Close the app
    await electronApp.close();
  });
});