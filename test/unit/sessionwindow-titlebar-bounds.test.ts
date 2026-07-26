import { afterEach, describe, expect, it } from 'vitest';
import { SessionWindow } from '../../src/main/sessionwindow/sessionwindow';

// _titleBarBounds is the single source of truth shared by load() and
// _resizeViews(); if the two ever diverge again the first paint gaps by a pixel
// on non-macOS. Drive it directly without the heavy constructor.
const realPlatform = process.platform;
function setPlatform(p: string): void {
  Object.defineProperty(process, 'platform', { value: p, configurable: true });
}

function windowWith(width: number): any {
  const win = Object.create(SessionWindow.prototype);
  win._window = { getContentBounds: () => ({ width, height: 600 }) };
  return win;
}

describe('SessionWindow._titleBarBounds', () => {
  afterEach(() => setPlatform(realPlatform));

  it('spans the full content width with no inset on macOS', () => {
    setPlatform('darwin');
    expect(windowWith(800)._titleBarBounds()).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 29
    });
  });

  it('insets by one pixel on non-macOS so the frame stays grabbable', () => {
    setPlatform('linux');
    expect(windowWith(800)._titleBarBounds()).toEqual({
      x: 1,
      y: 1,
      width: 798,
      height: 28
    });
  });
});
