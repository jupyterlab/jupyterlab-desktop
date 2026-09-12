import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

// Ctrl/Cmd and `=` zooms in, the same as Ctrl/Cmd and the shifted plus that
// shares the key (#550). Electron's default menu binds only the shifted one, so
// the app appends a hidden Zoom In item that carries the second accelerator.
//
// The key is injected from the main process with webContents.sendInputEvent.
// Playwright's keyboard goes straight to the renderer, so it reaches neither
// before-input-event nor the accelerator table: probed here, a Control+= press
// through the page left zoomLevel at 0 and fired no before-input-event at all.
//
// On macOS the accelerator is a key equivalent on the native menu, which only
// responds to real NSEvents, so an injected key cannot exercise it there.
test('Ctrl and = zooms the focused view in', async () => {
  test.skip(
    process.platform === 'darwin',
    'the native menu only answers real key events'
  );
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.waitForLoadState('load');

    const zoomLevels = await app.evaluate(
      async ({ BrowserWindow, webContents }) => {
        const view = webContents
          .getAllWebContents()
          .find(contents => contents.getTitle() === 'Welcome');
        if (!view) {
          throw new Error('the welcome view is not among the web contents');
        }
        // accelerators are matched against the focused window
        const win = BrowserWindow.getAllWindows()[0];
        win.focus();
        view.focus();
        const settle = () => new Promise(resolve => setTimeout(resolve, 400));
        const press = async (keyCode: string, modifiers: string[]) => {
          view.sendInputEvent({
            type: 'keyDown',
            keyCode,
            modifiers
          } as Electron.KeyboardInputEvent);
          view.sendInputEvent({
            type: 'keyUp',
            keyCode,
            modifiers
          } as Electron.KeyboardInputEvent);
          await settle();
          return view.zoomLevel;
        };

        const start = view.zoomLevel;
        const afterEquals = await press('=', ['control']);
        const afterPlus = await press('Plus', ['control', 'shift']);
        return { start, afterEquals, afterPlus };
      }
    );

    // `=` zooms in, and the accelerator the default menu already carried keeps
    // zooming in on top of it.
    expect(zoomLevels.start).toBe(0);
    expect(zoomLevels.afterEquals).toBeGreaterThan(zoomLevels.start);
    expect(zoomLevels.afterPlus).toBeGreaterThan(zoomLevels.afterEquals);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});

// The title bar is 29px of chrome with a fixed layout, so it refuses the zoom
// keys in its own before-input-event handler. `=` has to be refused with the
// other two, or the key added for #550 is the one way to zoom it.
test('the title bar refuses the zoom keys', async () => {
  test.skip(
    process.platform === 'darwin',
    'the native menu only answers real key events'
  );
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    await pageByTitle(app, /welcome/i);

    const zoomLevels = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      // the session window adds the title bar as its first child view
      const titleBar = win.contentView.children[0] as Electron.WebContentsView;
      win.focus();
      titleBar.webContents.focus();
      const start = titleBar.webContents.zoomLevel;
      for (const [keyCode, modifiers] of [
        ['=', ['control']],
        ['Plus', ['control', 'shift']],
        ['-', ['control']]
      ] as [string, string[]][]) {
        titleBar.webContents.sendInputEvent({
          type: 'keyDown',
          keyCode,
          modifiers
        } as Electron.KeyboardInputEvent);
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      return { start, end: titleBar.webContents.zoomLevel };
    });

    expect(zoomLevels.end).toBe(zoomLevels.start);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
