// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IServerFactory } from 'src/main/server';
import { IPythonEnvironment } from 'src/main/tokens';

type OpenFileEventListener = (path: string) => void;

export interface IElectronAPI {
  showServerConfigDialog: () => void;
  getCurrentPythonEnvironment: () => Promise<IPythonEnvironment>;
  getServerInfo: () => Promise<IServerFactory.IServerStarted>;
  broadcastLabUIReady: () => void;
  onOpenFileEvent: (callback: OpenFileEventListener) => void;
  getCurrentRootPath: () => Promise<string>;
  logger: {
    log: (...params: any[]) => void;
    info: (...params: any[]) => void;
    warn: (...params: any[]) => void;
    debug: (...params: any[]) => void;
    error: (...params: any[]) => void;
  };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    electronAPI: IElectronAPI;
  }
}
