// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IServerFactory } from 'src/main/server';

export interface IElectronAPI {
  getServerInfo: () => Promise<IServerFactory.IServerStarted>;
  broadcastLabUIReady: () => void;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  interface Window {
    electronAPI: IElectronAPI;
    jupyterapp: any;
  }
}
