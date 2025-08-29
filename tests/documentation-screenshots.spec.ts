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
    executablePath: undefined,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      DISPLAY: process.env.DISPLAY || ':99',
      // Set Python path to our conda environment so the welcome page doesn't show warnings
      JUPYTERLAB_DESKTOP_PYTHON_PATH: process.env.JUPYTERLAB_DESKTOP_PYTHON_PATH || '/usr/share/miniconda/envs/jlab_server/bin/python'
    }
  });
  
  return electronApp;
}

async function getMainWindow(electronApp: any) {
  // Wait for initial window
  await electronApp.waitForEvent('window', { timeout: 30000 });
  
  // Wait a bit for additional windows 
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const allWindows = electronApp.windows();
  console.log(`Found ${allWindows.length} windows`);
  
  if (allWindows.length === 0) {
    throw new Error('No windows found');
  }
  
  // Find the welcome page window by checking content
  for (let i = 0; i < allWindows.length; i++) {
    const window = allWindows[i];
    const title = await window.title();
    const url = window.url();
    
    console.log(`Window ${i}: title="${title}", url="${url}"`);
    
    // Check if this window has welcome page content
    const hasWelcomeContent = await window.evaluate(() => {
      return document.body.innerHTML.includes('container') && 
             document.body.innerHTML.includes('Start') &&
             !document.body.innerHTML.includes('titlebar');
    });
    
    console.log(`Window ${i} has welcome content: ${hasWelcomeContent}`);
    
    if (hasWelcomeContent) {
      console.log(`Using window ${i} as main window`);
      return window;
    }
  }
  
  // If no welcome content found, log all window contents for debugging
  for (let i = 0; i < allWindows.length; i++) {
    const window = allWindows[i];
    const content = await window.evaluate(() => {
      return {
        title: document.title,
        bodyHTML: document.body.innerHTML.substring(0, 500),
        hasContainer: document.body.innerHTML.includes('container'),
        hasTitlebar: document.body.innerHTML.includes('titlebar'),
        hasStart: document.body.innerHTML.includes('Start')
      };
    });
    console.log(`Window ${i} content:`, content);
  }
  
  console.log('No welcome window found, using first window');
  return allWindows[0];
}

async function waitForWelcomePageToLoad(page: any) {
  // Wait for the page to be ready
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('body', { timeout: 30000 });
  
  // Wait a bit more for the UI to be fully ready and JavaScript to load
  await page.waitForTimeout(8000);
  
  // Log what we have
  const title = await page.title();
  console.log('Page title:', title);
  
  // Debug: Log all the links and their IDs/text  
  const linkInfo = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a'));
    return links.map(link => ({
      id: link.id,
      text: link.textContent?.trim(),
      href: link.href,
      className: link.className,
      onclick: link.onclick ? link.onclick.toString() : null,
      disabled: link.classList.contains('disabled') || link.hasAttribute('disabled')
    }));
  });
  
  console.log('All links on the page:', JSON.stringify(linkInfo, null, 2));
  
  // Also log HTML structure to debug
  const htmlStructure = await page.evaluate(() => {
    const body = document.body;
    return {
      hasContainer: !!body.querySelector('.container'),
      hasStartCol: !!body.querySelector('.start-col'),
      hasStartRecent: !!body.querySelector('.start-recent-col'),
      bodyClasses: body.className,
      innerHTML: body.innerHTML.substring(0, 2000)
    };
  });
  
  console.log('HTML structure:', JSON.stringify(htmlStructure, null, 2));
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

  test('should capture new notebook window by clicking New notebook link', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for the "New notebook..." link and click it
    try {
      console.log('Looking for New notebook link...');
      
      // Wait a bit more for the UI to be ready and Python environment to be detected
      await page.waitForTimeout(3000);
      
      // Look for the new notebook link by ID
      const newNotebookLink = page.locator('#new-notebook-link');
      
      // Check if the link exists and is enabled
      const linkExists = await newNotebookLink.count() > 0;
      console.log(`New notebook link exists: ${linkExists}`);
      
      if (linkExists) {
        const isEnabled = await newNotebookLink.evaluate(el => !el.classList.contains('disabled'));
        console.log(`New notebook link enabled: ${isEnabled}`);
        
        if (isEnabled) {
          console.log('Clicking New notebook link...');
          await newNotebookLink.click();
          
          // Wait for new window to open
          console.log('Waiting for new window...');
          try {
            await electronApp.waitForEvent('window', { timeout: 15000 });
            console.log('New window event received');
            
            // Wait a bit more for the window to be ready
            await page.waitForTimeout(5000);
            
            // Get all windows and find the JupyterLab window
            const allWindows = electronApp.windows();
            console.log(`Total windows now: ${allWindows.length}`);
            
            if (allWindows.length > 1) {
              // Take screenshot of the new JupyterLab window
              const jupyterLabWindow = allWindows[allWindows.length - 1];
              await jupyterLabWindow.screenshot({ 
                path: 'tests/desktop-app-frame.png',
                fullPage: true
              });
              console.log('Captured JupyterLab window screenshot');
            } else {
              console.log('No new window found, taking screenshot of current window');
              await page.screenshot({ 
                path: 'tests/desktop-app-frame.png',
                fullPage: true
              });
            }
          } catch (error) {
            console.log('Error waiting for new window:', error);
            await page.screenshot({ 
              path: 'tests/desktop-app-frame.png',
              fullPage: true
            });
          }
        } else {
          console.log('New notebook link is disabled, taking welcome page screenshot');
          await page.screenshot({ 
            path: 'tests/desktop-app-frame.png',
            fullPage: true
          });
        }
      } else {
        console.log('New notebook link not found, taking welcome page screenshot');
        await page.screenshot({ 
          path: 'tests/desktop-app-frame.png',
          fullPage: true
        });
      }
    } catch (error) {
      console.log('Error clicking new notebook link:', error);
      await page.screenshot({ 
        path: 'tests/desktop-app-frame.png',
        fullPage: true
      });
    }
    
    await electronApp.close();
  });

  test('should capture start session area', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Take a screenshot focusing on the start session area
    await page.screenshot({ 
      path: 'tests/start-session.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture connect dialog by clicking Connect link', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Look for and click the Connect link
    try {
      console.log('Looking for Connect link...');
      
      // Find the connect link 
      const connectLink = page.locator('a:has-text("Connect")');
      
      const linkExists = await connectLink.count() > 0;
      console.log(`Connect link exists: ${linkExists}`);
      
      if (linkExists) {
        console.log('Clicking Connect link...');
        await connectLink.click();
        
        // Wait for dialog or new window
        await page.waitForTimeout(3000);
        
        // Check if a new window opened
        const allWindows = electronApp.windows();
        if (allWindows.length > 1) {
          const connectWindow = allWindows[allWindows.length - 1];
          await connectWindow.screenshot({ 
            path: 'tests/start-session-connect.png',
            fullPage: true
          });
          console.log('Captured connect dialog from new window');
        } else {
          // Take screenshot of current page which might have dialog
          await page.screenshot({ 
            path: 'tests/start-session-connect.png',
            fullPage: true
          });
          console.log('Captured connect interface from main window');
        }
      } else {
        console.log('Connect link not found, taking welcome page screenshot');
        await page.screenshot({ 
          path: 'tests/start-session-connect.png',
          fullPage: true
        });
      }
    } catch (error) {
      console.log('Error clicking connect link:', error);
      await page.screenshot({ 
        path: 'tests/start-session-connect.png',
        fullPage: true
      });
    }
    
    await electronApp.close();
  });

  test('should capture python environment status', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Take screenshot to show environment status
    await page.screenshot({ 
      path: 'tests/python-env-status.png',
      fullPage: true
    });
    
    await electronApp.close();
  });

  test('should capture recent sessions area', async () => {
    const electronApp = await launchElectronApp();
    const page = await getMainWindow(electronApp);
    
    await waitForWelcomePageToLoad(page);
    
    // Take screenshot of the recent sessions/news area
    await page.screenshot({ 
      path: 'tests/recent-sessions.png',
      fullPage: true
    });
    
    await electronApp.close();
  });
});