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
      // Set Python path to our conda environment so the welcome page doesn't show warnings
      JUPYTERLAB_DESKTOP_PYTHON_PATH: '/usr/share/miniconda/envs/jlab_server/bin/python'
    }
  });
  
  return electronApp;
}

async function getMainWindow(electronApp: any) {
  // Wait for initial window
  await electronApp.waitForEvent('window', { timeout: 15000 });
  
  // Wait a bit longer for additional windows to load
  try {
    await electronApp.waitForEvent('window', { timeout: 5000 });
  } catch (error) {
    console.log('No additional windows loaded');
  }
  
  let mainWindow = null;
  
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
    
    // Look for the welcome window (typically has more height and welcome content)
    const hasWelcomeContent = await window.evaluate(() => {
      return document.body.innerHTML.toLowerCase().includes('welcome') || 
             document.body.innerHTML.toLowerCase().includes('new session') ||
             document.body.innerHTML.toLowerCase().includes('jupyter');
    });
    
    const isMainWindow = hasWelcomeContent && dimensions.height > 300;
    
    console.log(`Window ${i}: hasWelcomeContent=${hasWelcomeContent}, isMainWindow=${isMainWindow}`);
    
    if (isMainWindow) {
      mainWindow = window;
      break;
    }
  }
  
  // Return the main window, or fall back to the first window
  return mainWindow || electronApp.firstWindow();
}

async function waitForWelcomePageToLoad(page: any) {
  // Wait for the welcome page to fully load
  await page.waitForLoadState('domcontentloaded');
  
  // Wait for body to be ready
  await page.waitForSelector('body', { timeout: 15000 });
  
  // Wait for application to be ready - look for common welcome page elements
  const welcomeSelectors = [
    '.welcome-view',
    '.welcome-page', 
    '.main-content',
    '.app-container',
    '[data-testid="welcome"]',
    '.start-section',
    '.session-buttons'
  ];
  
  let pageLoaded = false;
  for (const selector of welcomeSelectors) {
    try {
      await page.waitForSelector(selector, { timeout: 3000 });
      console.log(`Found welcome selector: ${selector}`);
      pageLoaded = true;
      break;
    } catch (error) {
      // Try next selector
    }
  }
  
  if (!pageLoaded) {
    console.log('No specific welcome selectors found, waiting for general page load');
    // Give it some time to load
    await page.waitForTimeout(3000);
  }
  
  // Debug: Log what's actually on the page
  const content = await page.evaluate(() => {
    return {
      title: document.title,
      bodyContent: document.body.innerHTML.substring(0, 1000),
      hasNewSessionText: document.body.innerHTML.toLowerCase().includes('new session'),
      hasConnectText: document.body.innerHTML.toLowerCase().includes('connect'),
      hasJupyterText: document.body.innerHTML.toLowerCase().includes('jupyter'),
      allButtonTexts: Array.from(document.querySelectorAll('button')).map(btn => btn.textContent?.trim()).filter(text => text),
      allLinkTexts: Array.from(document.querySelectorAll('a')).map(link => link.textContent?.trim()).filter(text => text),
      allElementsWithText: Array.from(document.querySelectorAll('*')).map(el => {
        const text = el.textContent?.trim();
        if (text && text.length > 0 && text.length < 100) {
          return `${el.tagName.toLowerCase()}: "${text}"`;
        }
        return null;
      }).filter(x => x).slice(0, 20)
    };
  });
  
  console.log('Page title:', content.title);
  console.log('Has new session text:', content.hasNewSessionText);
  console.log('Has connect text:', content.hasConnectText);
  console.log('Has jupyter text:', content.hasJupyterText);
  console.log('Button texts:', content.allButtonTexts);
  console.log('Link texts:', content.allLinkTexts);
  console.log('Elements with text:', content.allElementsWithText);
  console.log('Body content preview:', content.bodyContent);
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
    
    // Try to start a new session to show the full app frame
    try {
      // Look for "New session" or similar button
      const newSessionSelectors = [
        'button:has-text("New session")',
        'button:has-text("New Session")',
        'button:has-text("New notebook")',
        'button:has-text("New Notebook")',
        '.new-session-button',
        '.start-session-button',
        '[data-testid="new-session"]'
      ];
      
      let sessionStarted = false;
      for (const selector of newSessionSelectors) {
        try {
          const button = page.locator(selector);
          if (await button.isVisible()) {
            console.log(`Clicking button: ${selector}`);
            await button.click();
            sessionStarted = true;
            
            // Wait for JupyterLab to load
            await page.waitForFunction(() => {
              return document.body.innerHTML.includes('JupyterLab') || 
                     document.querySelector('.jp-MainAreaWidget') !== null ||
                     document.title.includes('JupyterLab');
            }, { timeout: 15000 });
            
            break;
          }
        } catch (error) {
          console.log(`Button ${selector} not found or not clickable`);
        }
      }
      
      if (!sessionStarted) {
        console.log('Could not start session, taking welcome page as app frame');
      }
    } catch (error) {
      console.log('Could not open session, taking welcome page as app frame:', error);
    }
    
    // Take screenshot of the application window
    await page.screenshot({ 
      path: 'tests/desktop-app-frame.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture start session interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for the start session area/buttons
    try {
      const startSectionSelectors = [
        '.start-section',
        '.session-buttons',
        '.welcome-actions',
        '.new-session-area',
        '[data-testid="start-section"]'
      ];
      
      let startSectionFound = false;
      for (const selector of startSectionSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            console.log(`Found start section: ${selector}`);
            await element.screenshot({ path: 'tests/start-session.png' });
            startSectionFound = true;
            break;
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      if (!startSectionFound) {
        console.log('Start section not found, looking for individual buttons');
        
        // Try to find individual buttons and screenshot their container
        const buttonSelectors = [
          'button:has-text("New session")',
          'button:has-text("New notebook")',
          'button:has-text("Open")',
          'button:has-text("Connect")'
        ];
        
        for (const selector of buttonSelectors) {
          try {
            const button = page.locator(selector);
            if (await button.isVisible()) {
              // Get the parent container of the buttons
              const container = button.locator('xpath=ancestor::div[contains(@class, "start") or contains(@class, "section") or contains(@class, "welcome")][1]');
              if (await container.isVisible()) {
                await container.screenshot({ path: 'tests/start-session.png' });
                startSectionFound = true;
                break;
              }
            }
          } catch (error) {
            // Try next selector
          }
        }
      }
      
      if (!startSectionFound) {
        console.log('No start section found, taking full page screenshot');
        await page.screenshot({ path: 'tests/start-session.png' });
      }
      
    } catch (error) {
      console.log('Error capturing start session interface:', error);
      await page.screenshot({ path: 'tests/start-session.png' });
    }
    
    await electronApp.close();
  });

  test('should capture connect to server interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for and click the Connect button
    try {
      const connectSelectors = [
        'button:has-text("Connect")',
        'button:has-text("Connect...")',
        'button:has-text("Connect to server")',
        '.connect-button',
        '.connect-server-button',
        '[data-testid="connect"]'
      ];
      
      let connectDialogOpened = false;
      for (const selector of connectSelectors) {
        try {
          const button = page.locator(selector);
          if (await button.isVisible()) {
            console.log(`Clicking connect button: ${selector}`);
            await button.click();
            
            // Wait for connect dialog to appear
            await page.waitForSelector('.connect-dialog, .server-connect-dialog, .remote-server-dialog, .modal, .dialog', { timeout: 5000 });
            
            // Screenshot the dialog
            const dialogElement = page.locator('.connect-dialog, .server-connect-dialog, .remote-server-dialog, .modal, .dialog').first();
            await dialogElement.screenshot({ path: 'tests/start-session-connect.png' });
            connectDialogOpened = true;
            break;
          }
        } catch (error) {
          console.log(`Connect button ${selector} not found or dialog didn't open`);
        }
      }
      
      if (!connectDialogOpened) {
        console.log('Connect dialog not opened, looking for connect button area');
        
        // Try to screenshot the connect button area
        for (const selector of connectSelectors) {
          try {
            const button = page.locator(selector);
            if (await button.isVisible()) {
              await button.screenshot({ path: 'tests/start-session-connect.png' });
              connectDialogOpened = true;
              break;
            }
          } catch (error) {
            // Try next
          }
        }
      }
      
      if (!connectDialogOpened) {
        console.log('No connect interface found, taking full page screenshot');
        await page.screenshot({ path: 'tests/start-session-connect.png' });
      }
      
    } catch (error) {
      console.log('Error capturing connect interface:', error);
      await page.screenshot({ path: 'tests/start-session-connect.png' });
    }
    
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for Python environment status in title bar or settings
    try {
      const envStatusSelectors = [
        '.python-env-status',
        '.env-status',
        '.server-status',
        '.title-bar .python-info',
        '.title-bar .env-info',
        '[data-testid="python-env"]',
        '.python-version',
        '.environment-selector'
      ];
      
      let envStatusFound = false;
      for (const selector of envStatusSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            console.log(`Found Python env status: ${selector}`);
            await element.click(); // Click to show popup if available
            
            // Wait for popup or expanded info
            try {
              await page.waitForSelector('.python-env-popup, .env-selector-popup, .python-status-popup, .dropdown, .menu', { timeout: 3000 });
              const popup = page.locator('.python-env-popup, .env-selector-popup, .python-status-popup, .dropdown, .menu').first();
              await popup.screenshot({ path: 'tests/python-env-status.png' });
              envStatusFound = true;
              break;
            } catch (popupError) {
              // No popup, just screenshot the element itself
              await element.screenshot({ path: 'tests/python-env-status.png' });
              envStatusFound = true;
              break;
            }
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      if (!envStatusFound) {
        console.log('Python env status not found, looking for title bar area');
        
        // Try to capture the title bar area which might contain environment info
        const titleBarSelectors = [
          '.title-bar',
          '.titlebar',
          '.app-header',
          '.header',
          'header'
        ];
        
        for (const selector of titleBarSelectors) {
          try {
            const titleBar = page.locator(selector);
            if (await titleBar.isVisible()) {
              await titleBar.screenshot({ path: 'tests/python-env-status.png' });
              envStatusFound = true;
              break;
            }
          } catch (error) {
            // Try next
          }
        }
      }
      
      if (!envStatusFound) {
        console.log('No environment status found, taking partial screenshot');
        await page.screenshot({ 
          path: 'tests/python-env-status.png'
        });
      }
      
    } catch (error) {
      console.log('Error capturing Python environment status:', error);
      await page.screenshot({ path: 'tests/python-env-status.png' });
    }
    
    await electronApp.close();
  });

  test('should capture recent sessions interface', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for recent sessions area
    try {
      const recentSessionsSelectors = [
        '.recent-sessions',
        '.session-history',
        '.sessions-list',
        '.recent-projects',
        '.session-panel',
        '.welcome-sidebar',
        '[data-testid="recent-sessions"]'
      ];
      
      let recentSessionsFound = false;
      for (const selector of recentSessionsSelectors) {
        try {
          const element = page.locator(selector);
          if (await element.isVisible()) {
            console.log(`Found recent sessions: ${selector}`);
            await element.screenshot({ path: 'tests/recent-sessions.png' });
            recentSessionsFound = true;
            break;
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      if (!recentSessionsFound) {
        console.log('Recent sessions area not found, looking for sidebar or history');
        
        // Try to find any sidebar or history area
        const sidebarSelectors = [
          '.sidebar',
          '.side-panel',
          '.welcome-left',
          '.welcome-right',
          '.history-panel'
        ];
        
        for (const selector of sidebarSelectors) {
          try {
            const sidebar = page.locator(selector);
            if (await sidebar.isVisible()) {
              await sidebar.screenshot({ path: 'tests/recent-sessions.png' });
              recentSessionsFound = true;
              break;
            }
          } catch (error) {
            // Try next
          }
        }
      }
      
      if (!recentSessionsFound) {
        console.log('No recent sessions area found, taking partial screenshot');
        await page.screenshot({ 
          path: 'tests/recent-sessions.png'
        });
      }
      
    } catch (error) {
      console.log('Error capturing recent sessions interface:', error);
      await page.screenshot({ path: 'tests/recent-sessions.png' });
    }
    
    await electronApp.close();
  });
});