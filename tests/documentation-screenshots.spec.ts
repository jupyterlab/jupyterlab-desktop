import { test, expect, _electron as electron } from '@playwright/test';
import * as path from 'path';

async function launchElectronApp() {
  // Launch JupyterLab Desktop with proper configuration
  const electronApp = await electron.launch({
    args: [
      path.join(__dirname, '../build/out/main/main.js'),
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security'
    ],
    executablePath: undefined, // Use system electron
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DISPLAY: process.env.DISPLAY || ':99',
      // Set Python path to our conda environment
      JUPYTERLAB_DESKTOP_PYTHON_PATH: '/usr/share/miniconda/envs/jlab_server/bin/python'
    }
  });
  
  return electronApp;
}

async function waitForAppToLoad(page: any) {
  // Wait for the basic page to load
  await page.waitForLoadState('domcontentloaded', { timeout: 20000 });
  
  // Wait for the app content to appear
  try {
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Give it time to initialize
    await page.waitForTimeout(5000);
    
    // Debug: Log page dimensions and content
    const dimensions = await page.evaluate(() => {
      return {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        bodyScrollHeight: document.body.scrollHeight,
        bodyContent: document.body.innerHTML.substring(0, 500)
      };
    });
    
    console.log('Page dimensions:', dimensions.windowWidth, 'x', dimensions.windowHeight);
    console.log('Body scroll height:', dimensions.bodyScrollHeight);
    console.log('Body content preview:', dimensions.bodyContent.substring(0, 100) + '...');
    
    // Check if we have any meaningful content
    const hasContent = await page.evaluate(() => {
      return document.body && document.body.innerHTML.length > 1000;
    });
    
    if (!hasContent) {
      console.log('Warning: App may not have loaded properly');
    }
  } catch (error) {
    console.log('Error waiting for app content:', error);
    // Continue anyway and try to take screenshot
  }
}

test.describe('Documentation Screenshots', () => {
  test('should capture welcome page', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Take full screenshot of the welcome page that matches the documentation
    await page.screenshot({ 
      path: 'tests/welcome-page.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture desktop app frame', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Take full application window screenshot
    await page.screenshot({ 
      path: 'tests/desktop-app-frame.png',
      fullPage: true  // Capture full page for app frame
    });
    
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Take screenshot of title bar area (fallback approach)
    await page.screenshot({
      path: 'tests/python-env-status.png',
      clip: { x: 0, y: 0, width: 800, height: 100 }
    });
    
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Check if this is the main window or title bar
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    
    if (dimensions.height > 100) {
      // Main window - take a reasonable clip
      await page.screenshot({
        path: 'tests/start-session.png',
        clip: { x: 0, y: 50, width: 300, height: 200 }
      });
    } else {
      // Small window - take full screenshot
      await page.screenshot({
        path: 'tests/start-session.png',
        fullPage: true
      });
    }
    
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Check if this is the main window or title bar
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    
    if (dimensions.height > 100) {
      // Main window - take a reasonable clip
      await page.screenshot({
        path: 'tests/start-session-connect.png',
        clip: { x: 0, y: 100, width: 250, height: 100 }
      });
    } else {
      // Small window - take full screenshot
      await page.screenshot({
        path: 'tests/start-session-connect.png',
        fullPage: true
      });
    }
    
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await electronApp.firstWindow();
    
    await waitForAppToLoad(page);
    
    // Check if this is the main window or title bar
    const dimensions = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    
    if (dimensions.height > 100) {
      // Main window - take a reasonable clip from lower area
      await page.screenshot({
        path: 'tests/recent-sessions.png',
        clip: { x: 0, y: 400, width: 400, height: Math.min(150, dimensions.height - 400) }
      });
    } else {
      // Small window - take full screenshot
      await page.screenshot({
        path: 'tests/recent-sessions.png',
        fullPage: true
      });
    }
    
    await electronApp.close();
  });
});