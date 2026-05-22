import { vi } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';

const userDataPath = join(tmpdir(), 'jlab-test-userdata');
const logFilePath = join(tmpdir(), 'jlab-test.log');

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => join(userDataPath, name)),
    getVersion: vi.fn(() => '4.4.7'),
    getName: vi.fn(() => 'JupyterLab'),
    isPackaged: false,
    whenReady: vi.fn(() => Promise.resolve())
  },
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
    emit: vi.fn()
  },
  dialog: {
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
    showMessageBoxSync: vi.fn(() => 0)
  },
  BrowserWindow: vi.fn().mockImplementation(() => ({
    loadURL: vi.fn(),
    webContents: { send: vi.fn(), on: vi.fn() },
    on: vi.fn(),
    once: vi.fn(),
    show: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false)
  })),
  shell: { openExternal: vi.fn(), openPath: vi.fn() },
  nativeTheme: { shouldUseDarkColors: false },
  screen: {
    getPrimaryDisplay: vi.fn(() => ({
      workAreaSize: { width: 1920, height: 1080 }
    }))
  }
}));

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    transports: {
      file: {
        level: 'info',
        getFile: () => ({ path: logFilePath })
      },
      console: { level: false }
    }
  }
}));
