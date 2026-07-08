import { expect, test } from '@playwright/test';
import { cleanup, launchApp } from './helpers';

// The title bar is drawn inside its own WebContentsView. Window dragging relies
// on `-webkit-app-region: drag` on the `.app-title` element, and every control
// button opts back out with `-webkit-app-region: no-drag`. Dropping either rule
// in a refactor silently breaks window moving or makes the buttons undraggable.
//
// This is only a guard on the computed CSS declaration. It does NOT exercise a
// real window move: synthetic Playwright/CDP mouse events do not drive the OS
// drag on the app-region hit-test, so an actual drag cannot be asserted here.
// The real window move, and the layered-WebContentsView no-drag hit-testing
// (electron/electron#43320), still have to be verified by hand per OS.
test('the title bar keeps its drag region and no-drag controls', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    // Arrange: find the titlebar page. It has no window title, so it is located
    // by the presence of its `#app-title` element, the same element-probe
    // pattern the dialog-titlebar test uses.
    const deadline = Date.now() + 20_000;
    let titlebar;
    while (!titlebar && Date.now() < deadline) {
      for (const page of app.windows()) {
        const hasTitle = await page
          .evaluate(() => !!document.getElementById('app-title'))
          .catch(() => false);
        if (hasTitle) {
          titlebar = page;
          break;
        }
      }
      if (!titlebar) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    if (!titlebar) {
      throw new Error('title bar page with #app-title never appeared');
    }
    await titlebar.waitForLoadState('load');

    // Act: read the computed app-region of the drag surface and of two control
    // buttons. The JS-side property is `webkitAppRegion`; its value is the
    // keyword ('drag' / 'no-drag'), not a length.
    const regions = await titlebar.evaluate(() => {
      const regionOf = (id: string) => {
        const el = document.getElementById(id);
        if (!el) {
          return null;
        }
        return (getComputedStyle(el) as CSSStyleDeclaration & {
          webkitAppRegion?: string;
        }).webkitAppRegion;
      };
      return {
        appTitle: regionOf('app-title'),
        closeButton: regionOf('close-button'),
        serverButton: regionOf('server-button')
      };
    });

    // Assert: the title is draggable and the controls explicitly opt out. If a
    // refactor drops the `-webkit-app-region` rules these flip to the inherited
    // default ('none') and the test fails.
    expect(regions.appTitle).toBe('drag');
    expect(regions.closeButton).toBe('no-drag');
    expect(regions.serverButton).toBe('no-drag');
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
