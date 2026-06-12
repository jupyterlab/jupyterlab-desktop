// Single source of truth for the mocked `electron` module.
// Aliased in vitest.config so BOTH `import ... from 'electron'` (ESM) and
// `require('electron')` (used by the preload scripts) resolve here to the same
// vi.fn instances. Native require would otherwise return the electron binary
// path string and bypass vi.mock, leaving preload code untestable.
import { vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

const userDataPath = join(tmpdir(), 'jlab-test-userdata');

export const app = {
  getPath: vi.fn((name: string) => join(userDataPath, name)),
  getVersion: vi.fn(() => '4.4.7'),
  getName: vi.fn(() => 'JupyterLab'),
  isPackaged: false,
  whenReady: vi.fn(() => Promise.resolve())
};

export const ipcMain = {
  on: vi.fn(),
  handle: vi.fn(),
  removeHandler: vi.fn(),
  removeListener: vi.fn(),
  removeAllListeners: vi.fn(),
  emit: vi.fn()
};

export const ipcRenderer = {
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
};

export const contextBridge = {
  exposeInMainWorld: vi.fn()
};

export const dialog = {
  showOpenDialog: vi.fn(),
  showMessageBox: vi.fn(),
  showMessageBoxSync: vi.fn(() => 0)
};

export const BrowserWindow = vi.fn().mockImplementation(() => ({
  loadURL: vi.fn(),
  webContents: { send: vi.fn(), on: vi.fn() },
  on: vi.fn(),
  once: vi.fn(),
  show: vi.fn(),
  close: vi.fn(),
  isDestroyed: vi.fn(() => false)
}));

export const shell = { openExternal: vi.fn(), openPath: vi.fn() };

export const nativeTheme = { shouldUseDarkColors: false };

export const screen = {
  getPrimaryDisplay: vi.fn(() => ({
    workAreaSize: { width: 1920, height: 1080 }
  }))
};
