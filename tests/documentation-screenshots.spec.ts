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

async function waitForAppReady(page: any) {
  // Wait for the welcome page content to be fully loaded
  await page.waitForSelector('body', { state: 'visible' });
  
  // Wait for content to load - use a simpler check
  await page.waitForFunction(() => {
    const body = document.body;
    return body && body.innerHTML.length > 500;
  }, { timeout: 15000 });
  
  // Additional wait for UI elements to render properly
  await page.waitForTimeout(3000);
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
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Look for the start session area and take a screenshot of that specific region
    const startElement = await page.locator(':has-text("New notebook"), :has-text("New session"), :has-text("Open")').first();
    if (await startElement.count() > 0) {
      await startElement.screenshot({ path: 'tests/start-session.png' });
    } else {
      // Fallback: take screenshot of left sidebar area
      await page.screenshot({ 
        path: 'tests/start-session.png',
        clip: { x: 0, y: 0, width: 500, height: 400 }
      });
    }
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Get viewport size first
    const viewport = await page.evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    });
    
    // Look for recent sessions area
    const recentElement = await page.locator(':has-text("Recent sessions"), :has-text("recent")').first();
    if (await recentElement.count() > 0) {
      await recentElement.screenshot({ path: 'tests/recent-sessions.png' });
    } else {
      // Fallback: take screenshot of a reasonable area that fits within viewport
      const clipWidth = Math.min(600, viewport.width);
      const clipHeight = Math.min(400, viewport.height - 200);
      
      if (clipWidth > 0 && clipHeight > 0) {
        await page.screenshot({ 
          path: 'tests/recent-sessions.png',
          clip: { x: 0, y: 200, width: clipWidth, height: clipHeight }
        });
      } else {
        // Last resort: full page screenshot
        await page.screenshot({ 
          path: 'tests/recent-sessions.png',
          fullPage: true 
        });
      }
    }
    
    expect(page).toBeTruthy();
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
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Look for python environment status in title bar or hover area
    const pythonEnvElement = await page.locator('[title*="Python"], :has-text("Python"), [title*="environment"]').first();
    if (await pythonEnvElement.count() > 0) {
      // Try to hover to show the environment status
      await pythonEnvElement.hover();
      await page.waitForTimeout(1000);
      await pythonEnvElement.screenshot({ path: 'tests/python-env-status.png' });
    } else {
      // Fallback: take screenshot of title bar area
      await page.screenshot({ 
        path: 'tests/python-env-status.png',
        clip: { x: 0, y: 0, width: 800, height: 100 }
      });
    }
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppReady(page);
    
    // Get viewport size first
    const viewport = await page.evaluate(() => {
      return {
        width: window.innerWidth,
        height: window.innerHeight
      };
    });
    
    // Look for connect button and click it to open the dialog
    const connectButton = await page.locator(':has-text("Connect"), [title*="Connect"]').first();
    if (await connectButton.count() > 0) {
      await connectButton.click();
      await page.waitForTimeout(1000);
      
      // Take screenshot of the connect dialog
      const dialog = await page.locator('[role="dialog"], .dialog, .modal').first();
      if (await dialog.count() > 0) {
        await dialog.screenshot({ path: 'tests/start-session-connect.png' });
      } else {
        // If no dialog found, take screenshot of the connect area
        await connectButton.screenshot({ path: 'tests/start-session-connect.png' });
      }
    } else {
      // Fallback: take screenshot of connect area that fits within viewport
      const clipWidth = Math.min(500, viewport.width);
      const clipHeight = Math.min(400, viewport.height - 100);
      
      if (clipWidth > 0 && clipHeight > 0) {
        await page.screenshot({ 
          path: 'tests/start-session-connect.png',
          clip: { x: 0, y: 100, width: clipWidth, height: clipHeight }
        });
      } else {
        // Last resort: full page screenshot
        await page.screenshot({ 
          path: 'tests/start-session-connect.png',
          fullPage: true 
        });
      }
    }
    
    expect(page).toBeTruthy();
    await electronApp.close();
  });
});