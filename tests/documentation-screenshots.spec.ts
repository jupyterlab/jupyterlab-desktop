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
      DISPLAY: process.env.DISPLAY || ':99'
      // Let the application use its bundled environment detection instead of overriding
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
    
    // Try to start a new JupyterLab session to show the full app frame
    try {
      // Wait a bit longer for the environment to be detected
      await page.waitForTimeout(5000);
      
      // Look for the actual link elements by ID
      const newSessionLink = page.locator('#new-session-link');
      const newNotebookLink = page.locator('#new-notebook-link');
      
      // Check if links are enabled
      const isNewSessionEnabled = await newSessionLink.evaluate(el => !el.classList.contains('disabled'));
      const isNewNotebookEnabled = await newNotebookLink.evaluate(el => !el.classList.contains('disabled'));
      
      console.log(`New session link enabled: ${isNewSessionEnabled}`);
      console.log(`New notebook link enabled: ${isNewNotebookEnabled}`);
      
      if (isNewSessionEnabled) {
        console.log('Clicking new session link');
        await newSessionLink.click();
        
        // Wait for JupyterLab to start
        await page.waitForTimeout(10000);
        
        // Wait for any new windows or content to appear
        try {
          await electronApp.waitForEvent('window', { timeout: 5000 });
        } catch (error) {
          console.log('No new window opened for JupyterLab session');
        }
      } else {
        console.log('New session link is disabled, Python environment not detected properly');
      }
    } catch (error) {
      console.log('Could not start JupyterLab session:', error);
    }
    
    // Take screenshot of the application window (might show session or welcome)
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
    
    // Look for the start section which contains the session buttons
    try {
      // Wait for the start section to be ready
      await page.waitForTimeout(3000);
      
      // Find the start section container
      const startSectionSelectors = [
        '.start-col',
        '.col.start-col',
        'div:has(#new-notebook-link)',
        'div:has(#new-session-link)'
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
        console.log('Start section not found, trying to capture individual links');
        
        // Try to capture the area around the session links
        const sessionLinkContainer = page.locator('#new-notebook-link, #new-session-link').first().locator('xpath=ancestor::div[1]');
        if (await sessionLinkContainer.isVisible()) {
          await sessionLinkContainer.screenshot({ path: 'tests/start-session.png' });
          startSectionFound = true;
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
    
    // Look for and click the Connect link
    try {
      await page.waitForTimeout(3000);
      
      // Find the connect link - it doesn't have an ID but has specific onclick
      const connectLink = page.locator('a:has-text("Connect...")');
      
      if (await connectLink.isVisible()) {
        console.log('Found connect link, clicking it');
        await connectLink.click();
        
        // Wait for connect dialog to appear
        try {
          await page.waitForTimeout(2000);
          
          // Check if a new window opened for the connect dialog
          const allWindows = electronApp.windows();
          if (allWindows.length > 2) {
            const connectWindow = allWindows[allWindows.length - 1];
            await connectWindow.screenshot({ path: 'tests/start-session-connect.png' });
            console.log('Captured connect dialog from new window');
          } else {
            // Look for dialog in the same window
            const dialogSelectors = [
              '.dialog',
              '.modal',
              '.connect-dialog',
              '[role="dialog"]'
            ];
            
            let dialogFound = false;
            for (const selector of dialogSelectors) {
              try {
                const dialog = page.locator(selector);
                if (await dialog.isVisible()) {
                  await dialog.screenshot({ path: 'tests/start-session-connect.png' });
                  dialogFound = true;
                  break;
                }
              } catch (error) {
                // Try next
              }
            }
            
            if (!dialogFound) {
              console.log('No dialog found, capturing connect link area');
              await connectLink.screenshot({ path: 'tests/start-session-connect.png' });
            }
          }
        } catch (error) {
          console.log('Error waiting for connect dialog:', error);
          await connectLink.screenshot({ path: 'tests/start-session-connect.png' });
        }
      } else {
        console.log('Connect link not found, taking full page screenshot');
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
    
    // Look for Python environment status - this might be in a notification or title bar
    try {
      await page.waitForTimeout(3000);
      
      // Look for notification panel that shows environment status
      const notificationSelectors = [
        '.notification-panel',
        '.env-notification',
        '.python-env-status',
        '.error-notification',
        'div:has(svg[style*="orange"])', // Look for warning icon
        'div:has(use[href="#triangle-exclamation"])', // Warning triangle
        '.alert',
        '.warning-message'
      ];
      
      let notificationFound = false;
      for (const selector of notificationSelectors) {
        try {
          const notification = page.locator(selector);
          if (await notification.isVisible()) {
            console.log(`Found notification panel: ${selector}`);
            await notification.screenshot({ path: 'tests/python-env-status.png' });
            notificationFound = true;
            break;
          }
        } catch (error) {
          // Try next selector
        }
      }
      
      if (!notificationFound) {
        console.log('No notification found, looking for status in page content');
        
        // Check if there's any Python-related status text
        const pythonStatusText = await page.evaluate(() => {
          const bodyText = document.body.textContent || '';
          if (bodyText.toLowerCase().includes('python') || 
              bodyText.toLowerCase().includes('environment') ||
              bodyText.toLowerCase().includes('install')) {
            return bodyText.substring(0, 500);
          }
          return null;
        });
        
        if (pythonStatusText) {
          console.log('Found Python status text:', pythonStatusText);
        }
        
        // Take a screenshot of the top portion which might contain status
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
    
    // Look for recent sessions area - should be on the right side or in a dedicated section
    try {
      await page.waitForTimeout(3000);
      
      // Look for recent sessions column or area
      const recentSessionsSelectors = [
        '.recent-col',
        '.col.recent-col',
        '.recent-sessions',
        '.session-history',
        'div:has-text("Recent")',
        '.recent-session-row',
        '.sessions-list'
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
        console.log('Recent sessions area not found, looking for news feed area');
        
        // The welcome page might have a news feed instead of recent sessions
        const newsFeedSelectors = [
          '.news-col',
          '.col.news-col',
          '.news-feed',
          'div:has-text("Jupyter")',
          'div:has-text("News")'
        ];
        
        for (const selector of newsFeedSelectors) {
          try {
            const element = page.locator(selector);
            if (await element.isVisible()) {
              console.log(`Found news feed area: ${selector}`);
              await element.screenshot({ path: 'tests/recent-sessions.png' });
              recentSessionsFound = true;
              break;
            }
          } catch (error) {
            // Try next
          }
        }
      }
      
      if (!recentSessionsFound) {
        console.log('No recent sessions or news area found, taking partial screenshot');
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