// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as path from 'path';
import * as fs from 'fs';
import {
  DEFAULT_WIN_HEIGHT,
  DEFAULT_WIN_WIDTH,
  FrontEndMode,
  resolveWorkingDirectory,
  SettingType,
  userSettings
} from './settings';

export class SessionConfig {
  x: number = 0;
  y: number = 0;
  width: number = DEFAULT_WIN_WIDTH;
  height: number = DEFAULT_WIN_HEIGHT;
  remoteURL: string = '';
  persistSessionData: boolean = true;
  workingDirectory: string = '';
  filesToOpen: string[] = [];
  pythonPath: string = '';
  defaultKernel: string = '';
  lastOpened: Date = new Date();

  url: URL;
  token: string;
  pageConfig: any;
  cookies?: Electron.Cookie[];

  static createLocal(
    workingDirectory?: string,
    filesToOpen?: string[],
    pythonPath?: string
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    sessionConfig.workingDirectory =
      workingDirectory ||
      userSettings.getValue(SettingType.defaultWorkingDirectory);
    if (filesToOpen) {
      sessionConfig.setFilesToOpen(filesToOpen);
    }
    sessionConfig.pythonPath =
      pythonPath || userSettings.getValue(SettingType.pythonPath);

    return sessionConfig;
  }

  static createLocalForFilesOrFolders(fileOrFolders?: string[]) {
    const folders: string[] = [];
    const files: string[] = [];

    fileOrFolders.forEach(filePath => {
      try {
        const stat = fs.lstatSync(filePath);

        if (stat.isFile()) {
          files.push(filePath);
        } else if (stat.isDirectory()) {
          folders.push(filePath);
        }
      } catch (error) {
        console.error('Failed to get info for selected files');
      }
    });

    if (files.length > 0) {
      const workingDir = path.dirname(files[0]);
      const sameWorkingDirFiles = files
        .filter(file => {
          return file.startsWith(workingDir);
        })
        .map(file => {
          return path.relative(workingDir, file);
        });
      return SessionConfig.createLocal(workingDir, sameWorkingDirFiles);
    } else if (folders.length > 0) {
      return SessionConfig.createLocal(folders[0]);
    }
  }

  static createRemote(
    remoteURL: string,
    persistSessionData?: boolean
  ): SessionConfig {
    const sessionConfig = new SessionConfig();
    sessionConfig.remoteURL = remoteURL;
    sessionConfig.persistSessionData = persistSessionData !== false;

    return sessionConfig;
  }

  get isRemote(): boolean {
    return this.remoteURL !== '';
  }

  get resolvedWorkingDirectory(): string {
    return resolveWorkingDirectory(this.workingDirectory);
  }

  setFilesToOpen(filePaths: string[]) {
    this.filesToOpen = [];

    const workingDir = this.resolvedWorkingDirectory;

    for (const filePath of filePaths) {
      const fullPath = path.join(workingDir, filePath);
      const stats = fs.lstatSync(fullPath);
      if (stats.isFile()) {
        this.filesToOpen.push(filePath);
      }
    }
  }

  deserialize(jsonData: any) {
    if ('x' in jsonData) {
      this.x = jsonData.x;
    }
    if ('y' in jsonData) {
      this.y = jsonData.y;
    }
    if ('width' in jsonData) {
      this.width = jsonData.width;
    }
    if ('height' in jsonData) {
      this.height = jsonData.height;
    }
    if ('lastOpened' in jsonData) {
      this.lastOpened = new Date(jsonData.lastOpened);
    }
    if ('remoteURL' in jsonData) {
      this.remoteURL = jsonData.remoteURL;
    }
    if ('persistSessionData' in jsonData) {
      this.persistSessionData = jsonData.persistSessionData;
    }
    if ('workingDirectory' in jsonData) {
      this.workingDirectory = jsonData.workingDirectory;
    }
    if ('filesToOpen' in jsonData) {
      this.filesToOpen = [...jsonData.filesToOpen];
    }
    if ('pageConfig' in jsonData) {
      this.pageConfig = JSON.parse(JSON.stringify(jsonData.pageConfig));
    }
  }

  serialize(): any {
    const jsonData: any = {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      lastOpened: this.lastOpened.toISOString()
    };

    if (this.remoteURL !== '') {
      jsonData.remoteURL = this.remoteURL;
    }

    if (this.persistSessionData === false) {
      jsonData.persistSessionData = this.persistSessionData;
    }

    if (this.workingDirectory !== '') {
      jsonData.workingDirectory = this.workingDirectory;
    }

    if (this.filesToOpen.length > 0) {
      jsonData.filesToOpen = [...this.filesToOpen];
    }

    // if local server and JupyterLab UI is in client-app mode
    if (
      this.pageConfig &&
      this.remoteURL === '' &&
      userSettings.getValue(SettingType.frontEndMode) === FrontEndMode.ClientApp
    ) {
      const pageConfig = JSON.parse(JSON.stringify(this.pageConfig));
      delete pageConfig['token'];
      jsonData.pageConfig = pageConfig;
    }

    return jsonData;
  }
}
