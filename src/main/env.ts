// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as fs from 'fs';
import * as path from 'path';
import { SettingType, userSettings } from './config/settings';
import { appData } from './config/appdata';
import { getBundledPythonInstallDir } from './utils';

export function getCondaPath() {
  let condaPath = userSettings.getValue(SettingType.condaPath);
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
  condaPath = appData.condaPath;
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
  condaPath = process.env['CONDA_EXE'];
  if (condaPath && fs.existsSync(condaPath)) {
    return condaPath;
  }
}

export function getSystemPythonPath() {
  let pythonPath = userSettings.getValue(SettingType.systemPythonPath);
  if (pythonPath && fs.existsSync(pythonPath)) {
    return pythonPath;
  }
  pythonPath = appData.systemPythonPath;
  if (pythonPath && fs.existsSync(pythonPath)) {
    return pythonPath;
  }
}

export function getPythonEnvsDirectory(): string {
  let envsPath = userSettings.getValue(SettingType.pythonEnvsPath);
  if (envsPath && fs.existsSync(envsPath)) {
    return envsPath;
  }

  const userDataDir = getBundledPythonInstallDir();

  return path.join(userDataDir, 'envs');
}

export function getNextPythonEnvName(): string {
  const envsDir = getPythonEnvsDirectory();
  const prefix = 'env_';
  const maxTries = 10000;

  let index = 1;
  const getNextName = () => {
    return `${prefix}${index++}`;
  };

  let name = getNextName();

  while (fs.existsSync(path.join(envsDir, name))) {
    if (index > maxTries) {
      return 'invalid_env';
    }
    name = getNextName();
  }

  return name;
}

export function condaExePathForEnvPath(envPath: string) {
  if (process.platform === 'win32') {
    return path.join(envPath, 'Scripts', 'conda.exe');
  } else {
    return path.join(envPath, 'bin', 'conda');
  }
}

export function condaEnvPathForCondaExePath(condaPath: string) {
  return path.resolve(path.dirname(condaPath), '..');
}
