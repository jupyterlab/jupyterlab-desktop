import { describe, expect, it, vi } from 'vitest';
import { TitleBarView } from '../../src/main/titlebarview/titlebarview';
import { EventTypeRenderer } from '../../src/main/eventtypes';

// Drive setMaximized without the heavy WebContentsView constructor: create an
// instance linked to the prototype and stub only the webContents.send it uses.
function makeTitleBarView(send: ReturnType<typeof vi.fn>): TitleBarView {
  const view = Object.create(TitleBarView.prototype);
  view._view = { webContents: { send } };
  return view;
}

describe('TitleBarView.setMaximized', () => {
  it('sends SetMaximized with true when the window is maximized', () => {
    // Arrange
    const send = vi.fn();
    const titleBarView = makeTitleBarView(send);

    // Act
    titleBarView.setMaximized(true);

    // Assert
    expect(send).toHaveBeenCalledWith(EventTypeRenderer.SetMaximized, true);
  });

  it('sends SetMaximized with false when the window is restored', () => {
    // Arrange
    const send = vi.fn();
    const titleBarView = makeTitleBarView(send);

    // Act
    titleBarView.setMaximized(false);

    // Assert
    expect(send).toHaveBeenCalledWith(EventTypeRenderer.SetMaximized, false);
  });
});
