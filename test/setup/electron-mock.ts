import { vi } from 'vitest';

const userDataPath = '/tmp/jlab-test-userdata';

// isDevMode() in utils.ts calls require.main.filename. In vitest's ESM context
// require.main is undefined; patch it so unit tests can call getAppDir() on darwin.
if (typeof require !== 'undefined' && !(require as any).main) {
  (require as any).main = { filename: '/test/vitest-runner.js' };
}

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name: string) => `${userDataPath}/${name}`),
    getAppPath: vi.fn(() => `${userDataPath}/app`),
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
  ipcRenderer: {
    on: vi.fn(),
    send: vi.fn(),
    invoke: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  },
  contextBridge: {
    exposeInMainWorld: vi.fn()
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
        getFile: () => ({ path: '/tmp/test.log' })
      },
      console: { level: false }
    }
  }
}));
