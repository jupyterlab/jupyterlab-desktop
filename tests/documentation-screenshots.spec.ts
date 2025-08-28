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

async function getMainWindow(electronApp: any) {
  // Wait for initial window
  await electronApp.waitForEvent('window', { timeout: 10000 });
  
  // Wait a bit longer for additional windows to load
  try {
    await electronApp.waitForEvent('window', { timeout: 3000 });
  } catch (error) {
    console.log('No additional windows loaded');
  }
  
  let mainWindow = null;
  let titlebarWindow = null;
  
  // Look through all windows to find the main content window
  const allWindows = electronApp.windows();
  console.log(`Found ${allWindows.length} windows`);
  
  for (let i = 0; i < allWindows.length; i++) {
    const window = allWindows[i];
    const title = await window.title();
    const url = window.url();
    
    // Log window info for debugging
    const dimensions = await window.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    
    console.log(`Window ${i}: title="${title}", url="${url}", dimensions=${dimensions.width}x${dimensions.height}`);
    
    // Look for webview elements or different content patterns
    const hasWebview = await window.evaluate(() => {
      return document.querySelector('webview') !== null;
    });
    
    const hasMainContent = await window.evaluate(() => {
      return document.body.innerHTML.length > 5000; // More substantial content
    });
    
    console.log(`Window ${i}: hasWebview=${hasWebview}, hasMainContent=${hasMainContent}`);
    
    // Determine if this is the main window or title bar
    if (hasWebview || hasMainContent || dimensions.height > 400) {
      mainWindow = window;
    } else if (dimensions.height <= 100 || title === 'Welcome') {
      titlebarWindow = window;
    }
  }
  
  // Return the main window, or fall back to the first window
  return mainWindow || titlebarWindow || electronApp.firstWindow();
}

async function waitForWelcomePageToLoad(page: any) {
  // Wait for the welcome page to fully load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for body to be ready
  await page.waitForSelector('body', { timeout: 10000 });
  
  // Debug: Log what's actually on the page
  const content = await page.evaluate(() => {
    return {
      title: document.title,
      bodyClasses: document.body.className || '',
      bodyContent: document.body.innerHTML.substring(0, 1000),
      allElements: Array.from(document.querySelectorAll('*')).slice(0, 20).map(el => {
        const className = el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').join('.') : '';
        const id = el.id ? '#' + el.id : '';
        return el.tagName + className + id;
      }),
      webviewCount: document.querySelectorAll('webview').length,
      hasWelcomeContent: document.body.innerHTML.includes('welcome') || document.body.innerHTML.includes('Welcome')
    };
  });
  
  console.log('Page title:', content.title);
  console.log('Body classes:', content.bodyClasses);
  console.log('All elements (first 20):', content.allElements);
  console.log('Webview count:', content.webviewCount);
  console.log('Has welcome content:', content.hasWelcomeContent);
  console.log('Body content preview:', content.bodyContent.substring(0, 200) + '...');
  
  // If we have webviews, this might be the container page - let's wait for them to load
  if (content.webviewCount > 0) {
    console.log('Found webviews, waiting for them to load...');
    // Wait for webview to be ready
    await page.waitForFunction(() => {
      const webviews = document.querySelectorAll('webview');
      return webviews.length > 0 && Array.from(webviews).some(wv => wv.src);
    }, { timeout: 10000 });
  }
  
  // Try to wait for any of the common welcome page selectors
  const welcomeSelectors = [
    'webview',
    '.welcome-view',
    '.welcome-page', 
    '.main-content',
    '.app-container',
    'body.loaded',
    'div[class*="welcome"]',
    'main'
  ];
  
  let pageLoaded = false;
  for (const selector of welcomeSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      console.log(`Found selector: ${selector}`);
      pageLoaded = true;
      break;
    } catch (error) {
      // Try next selector
    }
  }
  
  if (!pageLoaded) {
    console.log('No specific welcome selectors found, waiting for general page load');
    // Give it some time to load
    await page.waitForTimeout(2000);
  }
}

async function openStartServerDialog(page: any) {
  // Look for and click the "New Python session" or "Start Server" button
  const startButtons = [
    '.start-server-button',
    '.new-session-button', 
    'button:has-text("New Python session")',
    'button:has-text("Start Server")',
    '.session-start-btn'
  ];
  
  for (const selector of startButtons) {
    try {
      const button = page.locator(selector);
      if (await button.isVisible()) {
        await button.click();
        return;
      }
    } catch (error) {
      // Try next selector
    }
  }
  
  console.log('Could not find start server button');
}

async function openConnectToServerDialog(page: any) {
  // Look for and click the "Connect to server" or similar button
  const connectButtons = [
    '.connect-server-button',
    'button:has-text("Connect to server")',
    'button:has-text("Connect")',
    '.connect-btn'
  ];
  
  for (const selector of connectButtons) {
    try {
      const button = page.locator(selector);
      if (await button.isVisible()) {
        await button.click();
        return;
      }
    } catch (error) {
      // Try next selector
    }
  }
  
  console.log('Could not find connect to server button');
}

async function openPythonEnvDialog(page: any) {
  // Look for and click the python environment status or settings
  const envButtons = [
    '.python-env-status',
    '.env-status-button',
    '.server-status-button',
    'button:has-text("Python")',
    '.title-bar .python-info'
  ];
  
  for (const selector of envButtons) {
    try {
      const button = page.locator(selector);
      if (await button.isVisible()) {
        await button.click();
        return;
      }
    } catch (error) {
      // Try next selector
    }
  }
  
  console.log('Could not find python environment button');
}

test.describe('Documentation Screenshots', () => {
  test('should capture welcome page', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Take screenshot of the full welcome page
    await page.screenshot({ 
      path: 'tests/welcome-page.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture desktop app frame', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Try to open a session to show the full app frame
    try {
      await openStartServerDialog(page);
      // Wait for session window or new content to load
      await page.waitForFunction(() => {
        return document.body.innerHTML.includes('JupyterLab') || 
               document.querySelector('.session-window') !== null;
      }, { timeout: 10000 });
    } catch (error) {
      console.log('Could not open session, taking welcome page as app frame');
    }
    
    // Take screenshot of the application window
    await page.screenshot({ 
      path: 'tests/desktop-app-frame.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Try to find and capture the python environment status
    try {
      await openPythonEnvDialog(page);
      // Wait for environment dialog or popup to appear
      await page.waitForSelector('.python-env-dialog, .env-selector, .python-status-popup', { timeout: 5000 });
    } catch (error) {
      console.log('Python environment dialog not found, capturing title bar area');
    }
    
    // Take screenshot of the environment status area
    const envElement = page.locator('.python-env-dialog, .env-selector, .python-status-popup, .title-bar').first();
    if (await envElement.isVisible()) {
      await envElement.screenshot({ path: 'tests/python-env-status.png' });
    } else {
      // Fallback: capture a portion that likely contains environment info
      await page.screenshot({
        path: 'tests/python-env-status.png',
        clip: { x: 0, y: 0, width: 400, height: 60 }
      });
    }
    
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Open the start session dialog
    await openStartServerDialog(page);
    
    // Wait for the dialog to appear
    try {
      await page.waitForSelector('.start-session-dialog, .new-session-dialog, .server-start-dialog', { timeout: 5000 });
      
      // Take screenshot of the dialog
      const dialogElement = page.locator('.start-session-dialog, .new-session-dialog, .server-start-dialog').first();
      await dialogElement.screenshot({ path: 'tests/start-session.png' });
    } catch (error) {
      console.log('Start session dialog not found, taking area screenshot');
      // Fallback: capture the area where session controls should be
      const sessionArea = page.locator('.session-controls, .welcome-actions, .session-buttons').first();
      if (await sessionArea.isVisible()) {
        await sessionArea.screenshot({ path: 'tests/start-session.png' });
      } else {
        await page.screenshot({
          path: 'tests/start-session.png',
          clip: { x: 0, y: 100, width: 400, height: 200 }
        });
      }
    }
    
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Open the connect to server dialog
    await openConnectToServerDialog(page);
    
    // Wait for the dialog to appear
    try {
      await page.waitForSelector('.connect-server-dialog, .server-connect-dialog, .remote-server-dialog', { timeout: 5000 });
      
      // Take screenshot of the dialog
      const dialogElement = page.locator('.connect-server-dialog, .server-connect-dialog, .remote-server-dialog').first();
      await dialogElement.screenshot({ path: 'tests/start-session-connect.png' });
    } catch (error) {
      console.log('Connect server dialog not found, taking area screenshot');
      // Fallback: capture the area where connect controls should be
      const connectArea = page.locator('.connect-controls, .server-connect, .remote-actions').first();
      if (await connectArea.isVisible()) {
        await connectArea.screenshot({ path: 'tests/start-session-connect.png' });
      } else {
        await page.screenshot({
          path: 'tests/start-session-connect.png',
          clip: { x: 0, y: 150, width: 400, height: 150 }
        });
      }
    }
    
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for recent sessions area
    try {
      await page.waitForSelector('.recent-sessions, .session-history, .sessions-list', { timeout: 5000 });
      
      // Take screenshot of the recent sessions area
      const sessionsElement = page.locator('.recent-sessions, .session-history, .sessions-list').first();
      await sessionsElement.screenshot({ path: 'tests/recent-sessions.png' });
    } catch (error) {
      console.log('Recent sessions area not found, taking area screenshot');
      // Fallback: capture the area where recent sessions should be
      const recentArea = page.locator('.welcome-sidebar, .sessions-panel').first();
      if (await recentArea.isVisible()) {
        await recentArea.screenshot({ path: 'tests/recent-sessions.png' });
      } else {
        await page.screenshot({
          path: 'tests/recent-sessions.png',
          clip: { x: 0, y: 300, width: 500, height: 200 }
        });
      }
    }
    
    await electronApp.close();
  });
});