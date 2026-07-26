import { expect, test } from '@playwright/test';
import { cleanup, launchApp, pageByTitle } from './helpers';

// The ThemedWindow dialogs (About, Settings, Manage environments, ...) draw
// their title bar, window title and close button through the
// <jlab-dialog-titlebar> custom element. That element is compiled by the
// project's tsc and injected as an inline script into a data: URL page. When
// tsc emits CommonJS (tsconfig `module: nodenext`) the script references
// `exports`, throws `exports is not defined` as an ES module, and aborts before
// customElements.define runs, so every dialog silently loses its title bar and
// close button. This pins that the element registers and renders its content.
test('a ThemedWindow dialog renders its custom title bar and close button', async () => {
  const { app, userDataDir, jupyterDir } = await launchApp();
  try {
    // Arrange: the welcome window is the renderer that opens the dialog.
    const welcome = await pageByTitle(app, /welcome/i);
    await welcome.waitForLoadState('domcontentloaded');

    // Act: open the Manage Python environments dialog through the same IPC the
    // UI uses.
    await welcome.evaluate(() =>
      ((window as unknown) as {
        electronAPI: { sendMessageToMain: (message: string) => void };
      }).electronAPI.sendMessageToMain('show-manage-python-environments-dialog')
    );

    // Find the dialog window by the presence of the <jlab-dialog-titlebar>
    // element itself (every ThemedWindow embeds it, registered or not), not by
    // URL text: a seeded env also opens an env-select popup whose body contains
    // the label "Manage Python environments", and matching on that grabbed the
    // wrong window. The element is absent from that popup.
    const deadline = Date.now() + 20_000;
    let dialog;
    while (!dialog && Date.now() < deadline) {
      for (const page of app.windows()) {
        const isDialog = await page
          .evaluate(() => !!document.querySelector('jlab-dialog-titlebar'))
          .catch(() => false);
        if (isDialog) {
          dialog = page;
          break;
        }
      }
      if (!dialog) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    if (!dialog) {
      throw new Error('Manage Python environments dialog window never opened');
    }
    await dialog.waitForLoadState('load');
    // Wait for the custom element to register; swallow the timeout so a
    // regression (the element never defines) still reaches the assertion below
    // and fails with a clear message rather than an opaque timeout.
    await dialog
      .waitForFunction(
        () => !!customElements.get('jlab-dialog-titlebar'),
        undefined,
        {
          timeout: 10_000
        }
      )
      .catch(() => undefined);

    // Assert: the custom element registered (the regression signal) and drew
    // both the window title and the close button inside its shadow root.
    const rendered = await dialog.evaluate(() => {
      const el = document.querySelector('jlab-dialog-titlebar');
      const shadow = el?.shadowRoot;
      return {
        defined: !!customElements.get('jlab-dialog-titlebar'),
        title: shadow?.querySelector('.dialog-title')?.textContent ?? null,
        hasCloseButton: !!shadow?.querySelector('.close-button')
      };
    });
    expect(rendered.defined).toBe(true);
    expect(rendered.title).toBe('Manage Python environments');
    expect(rendered.hasCloseButton).toBe(true);
  } finally {
    await app.close();
    cleanup(userDataDir, jupyterDir);
  }
});
