// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import {
  BrowserWindow,
  clipboard,
  dialog,
  Menu,
  MenuItemConstructorOptions
} from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { ThemedWindow } from '../dialog/themedwindow';
import { IPythonEnvironment } from '../tokens';
import {
  createCommandScriptInEnv,
  deletePythonEnvironment,
  envPathForPythonPath,
  getBundledPythonPath,
  isEnvInstalledByDesktopApp,
  launchTerminalInDirectory,
  openDirectoryInExplorer,
  waitForDuration
} from '../utils';
import { EventManager } from '../eventmanager';
import { EventTypeMain, EventTypeRenderer } from '../eventtypes';
import { JupyterApplication } from '../app';
import {
  condaEnvPathForCondaExePath,
  getCondaChannels,
  getCondaPath,
  getNextPythonEnvName,
  getPythonEnvsDirectory,
  getSystemPythonPath
} from '../env';

export class ManagePythonEnvironmentDialog {
  constructor(options: ManagePythonEnvironmentDialog.IOptions) {
    this._app = options.app;
    this._window = new ThemedWindow({
      isDarkTheme: options.isDarkTheme,
      title: 'Manage Python environments',
      width: 800,
      height: 600,
      preload: path.join(__dirname, './preload.js')
    });

    let defaultPythonPath = options.defaultPythonPath;
    const bundledPythonPath = getBundledPythonPath();

    if (defaultPythonPath === '') {
      defaultPythonPath = bundledPythonPath;
    }
    const bundledEnvInstallationExists = options.bundledEnvInstallationExists;

    const selectBundledPythonPath =
      (defaultPythonPath === '' || defaultPythonPath === bundledPythonPath) &&
      bundledEnvInstallationExists;

    const bundledEnvInstallationLatest = options.bundledEnvInstallationLatest;

    const infoIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/info-icon.svg')
    );
    const menuIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/ellipsis-vertical.svg')
    );
    const checkIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/check-icon.svg')
    );
    const xMarkIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/xmark.svg')
    );
    const xMarkCircleIconSrc = fs.readFileSync(
      path.join(__dirname, '../../../app-assets/xmark-circle.svg')
    );

    const pythonEnvName = getNextPythonEnvName();
    const pythonEnvInstallPath = getPythonEnvsDirectory();
    const condaPath = getCondaPath() || '';
    const condaChannels = getCondaChannels().join(' ');
    const systemPythonPath = getSystemPythonPath() || '';
    const activateRelPath =
      process.platform === 'win32'
        ? path.join('Scripts', 'activate.bat')
        : path.join('bin', 'activate');

    this._evm.registerEventHandler(
      EventTypeMain.ShowPythonEnvironmentContextMenu,
      async (event, pythonPath) => {
        const envPath = envPathForPythonPath(pythonPath);
        const installedByApp = isEnvInstalledByDesktopApp(envPath);
        const deletable =
          installedByApp &&
          !this._app.serverFactory.isEnvironmentInUse(pythonPath);
        const openInExplorerLabel =
          process.platform === 'darwin'
            ? 'Reveal in Finder'
            : 'Open in Explorer';
        const envMenuTemplate: MenuItemConstructorOptions[] = [
          {
            label: 'Copy Python path',
            click: () => {
              clipboard.writeText(pythonPath);
            }
          },
          {
            label: 'Copy environment info',
            click: () => {
              const env = this._app.registry.getEnvironmentByPath(pythonPath);
              if (env) {
                clipboard.writeText(
                  JSON.stringify({
                    pythonPath: env.path,
                    name: env.name,
                    type: env.type,
                    versions: env.versions,
                    defaultKernel: env.defaultKernel
                  })
                );
              } else {
                clipboard.writeText('Failed to get environment info!');
              }
            }
          },
          {
            label: 'Launch Terminal',
            click: () => {
              const condaPath = getCondaPath() || '';
              const condaEnvPath = condaEnvPathForCondaExePath(condaPath);
              const activateCommand = createCommandScriptInEnv(
                envPath,
                condaEnvPath
              );

              launchTerminalInDirectory(envPath, activateCommand);
            }
          },
          {
            label: openInExplorerLabel,
            click: () => {
              openDirectoryInExplorer(envPath);
            }
          }
        ];

        const deletableEnvMenuItems: MenuItemConstructorOptions[] = [
          { type: 'separator' },
          {
            label: 'Delete',
            click: async () => {
              const envPath = envPathForPythonPath(pythonPath);
              const envName = path.basename(envPath);

              const choice = dialog.showMessageBoxSync({
                type: 'warning',
                message: `Delete environment`,
                detail: `Are you sure you want to delete "${envName}"?`,
                buttons: ['Delete', 'Cancel'],
                defaultId: 1,
                cancelId: 1
              });

              // allow dialog to close
              if (choice === 0) {
                await waitForDuration(200);
              } else {
                return;
              }

              this._window.window.webContents.send(
                EventTypeRenderer.SetEnvironmentListUpdateStatus,
                'ENV-DELETE-RUNNING'
              );
              try {
                await deletePythonEnvironment(envPath);
                this._window.window.webContents.send(
                  EventTypeRenderer.SetEnvironmentListUpdateStatus,
                  'ENV-DELETE-RUNNING'
                );
                this._app.registry.removeEnvironment(pythonPath);
                this._window.window.webContents.send(
                  EventTypeRenderer.SetEnvironmentListUpdateStatus,
                  'ENV-DELETE-FINISHED'
                );
              } catch (error) {
                this._window.window.webContents.send(
                  EventTypeRenderer.SetEnvironmentListUpdateStatus,
                  'ENV-DELETE-FAILED',
                  `Failed to delete environment. ${error.message}`
                );
              }
            }
          }
        ];

        const menu = Menu.buildFromTemplate(
          deletable
            ? [...envMenuTemplate, ...deletableEnvMenuItems]
            : envMenuTemplate
        );
        menu.popup({
          window: BrowserWindow.fromWebContents(event.sender)
        });
      }
    );

    const template = `
      <style>
      body {
        background-image: url(../../../app-assets/info-icon.svg);
      }
      #container {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      #content-area {
        background: var(--neutral-layer-2);
        width: 100%;
      }
      #env-list-progress {
        width: 100%;
        display: none;
      }
      #env-list-progress-message {
        display: none;
        border: 1px solid var(--error-fill-hover);
        padding: 5px;
        box-sizing: border-box;
        margin-top: 5px;
      }
      #env-list-progress-message-content {
        flex-grow: 1;
      }
      #env-list-progress-message-close {
        cursor: pointer;
      }
      #env-list-progress-message-close svg {
        width: 16px;
        height: 16px;
      }
      #env-list-progress-message-close svg path {
        fill: var(--error-fill-hover);
      }
      #category-tabs {
        width: 100%;
        height: 100%;
      }
      #bundled-env-warning {
        display: none;
        align-items: center;
        height: 40px;
      }
      #bundled-env-warning.warning {
        color: orange;
      }
      #install-bundled-env {
        display: none;
      }
      #update-bundled-env {
        display: none;
      }
      .row {
        display: flex;
        align-items: center;
        width: 100%;
      }
      .progress-message {
        margin-right: 5px; line-height: 24px; visibility: hidden;
      }
      .progress-animation {
        margin-right: 5px; visibility: hidden;
      }
      #clear-create-form {
        display: none;
      }
      #toggle-install-output {
        display: none;
      }
      .setting-section {
        display: flex;
        flex-direction: column;
        align-items: baseline;
        padding-bottom: 10px;
      }
      .setting-section .header {
        line-height: 30px;
        font-size: 14px;
        font-weight: bold;
      }
      .setting-section jp-text-field {
        width: 100%;
      }
      .setting-section.env-list-section {
        overflow-y: auto;
        margin-bottom: 10px;
      }
      .setting-section.conda-channels-section {
        width: 50%;
      }
      jp-tab-panel .setting-section:last-child {
        border-bottom: none;
      }
      #package-list {
        width: 100%;
      }
      #package-list::part(control) {
        height: 40px;
      }
      #create-command-preview::part(control) {
        height: 80px;
      }
      #package-list.invalid::part(control) {
        border-color: red;
      }
      .info-icon {
        display: inline-block;
        margin-left: 5px;
      }
      .info-icon svg path {
        fill: var(--neutral-stroke-hover);
      }
      .create-env-action-row {
        height: 40px;
      }
      #create-env-output-row {
        display: none;
      }
      #env-install-path-label {
        margin-top: 5px;
        color: var(--neutral-stroke-hover);
      }
      .tab-panel-content {
        display: flex;
        flex-direction: column;
        height: 100%;
      }
      #create-env-output::part(control) {
        height: 100%;
        font-size: 12px;
      }
      jp-text-input[readonly]::part(control), jp-text-area[readonly]::part(control) {
        color: var(--neutral-stroke-hover);
      }
      #new-env-name {
        max-width: 200px;
      }
      #env-list {
        max-width: calc(100% - 5px);
        width: 100%;
        box-shadow: none;
      }
      jp-menu {
        background: none;
      }
      jp-menu-item {
        padding-left: 15px;
      }
      jp-menu-item.menu-category {
        background: var(--neutral-layer-3);
        padding-left: 5px;
      }
      jp-menu-item.active {
        background: var(--neutral-layer-4);
      }
      jp-menu-item::part(content) {
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        margin-left: 10px;
      }
      jp-menu-item::part(start) {
        width: 100%;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        margin-left: 10px;
        justify-content: left;
      }
      .env-right-content {
        display: flex;
        align-items: center;
        margin-right: -10px;
      }
      .env-menu-icon {
        margin-left: 10px;
        width: 24px;
        height: 24px;
      }
      .env-menu-icon svg {
        width: 24px;
        margin-top: 4px;
      }
      .env-menu-icon:hover {
        background-color: var(--neutral-layer-1);
      }
      jp-text-field .valid-icon svg, jp-text-field .invalid-icon svg {
        width: 18px;
        height: 18px;
      }
      jp-text-field .valid-icon {
        display: none;
      }
      jp-text-field .valid-icon svg path {
        fill: var(--accent-fill-hover);
      }
      jp-text-field .invalid-icon {
        display: none;
      }
      jp-text-field .invalid-icon svg path {
        fill: var(--error-fill-hover);
      }
      .env-list-description-row {
        padding: 5px;
        color: var(--neutral-foreground-hint);
      }
      </style>
      <div id="container">
      <jp-tabs id="category-tabs" false="" orientation="vertical">
        <jp-tab id="tab-envs">Environments</jp-tab>
        <jp-tab id="tab-create">Create new</jp-tab>
        <jp-tab id="tab-settings">Settings</jp-tab>

        <jp-tab-panel id="tab-panel-envs">
          <div class="tab-panel-content">
            <div class="setting-section">
              <div class="row env-list-description-row">
                Python paths for compatible environments discovered on your system are listed below. You can add other environments by selecting a Python executable path on your system, or create new environments. 'jupyterlab' Python package needs to be installed in an environment to be compatible with JupyterLab Desktop.
              </div>
              <div class="row">
                <jp-button appearance="accent" onclick='handleAddExistingEnv(this);'>Add existing</jp-button>
                <jp-button appearance="accent" onclick='handleCreateNewEnvLink(this);'>Create new</jp-button>
              </div>
              <div class="row">  
                <jp-progress id="env-list-progress"></jp-progress>
              </div>
              <div id="env-list-progress-message" class="row">
                <div id="env-list-progress-message-content"></div>
                <div id="env-list-progress-message-close" onclick='setEnvListProgressMessage("");'>${xMarkIconSrc}</div>
              </div>
            </div>

            <div class="setting-section env-list-section">
              <div id="content-area">
                <jp-menu id="env-list">
                </jp-menu>
              </div>
            </div>
          </div>
        </jp-tab-panel>

        <jp-tab-panel id="tab-panel-create">
          <div class="tab-panel-content">
            <div class="setting-section">
              <div class="header">
              Create
              </div>
              <div class="row">
                <jp-radio-group orientation="horizontal">
                  <jp-radio id="create-copy-of-bundled-env" name="new-env-creteate-method" value="create-copy-of-bundled-env" checked onchange="handleNewEnvCreateMethodChange(this);">Copy of the bundled environment</jp-radio>
                  <jp-radio id="create-new-env" name="new-env-creteate-method" value="create-new-env" onchange="handleNewEnvCreateMethodChange(this);">New environment</jp-radio>
                </jp-radio-group>
              </div>
            </div>

            <div class="setting-section">
              <div class="header">
              Name<div class="info-icon" title="Name of the environment and the installation directory">${infoIconSrc}</div>
              </div>
              <div class="row">
                <jp-text-field type="text" id="new-env-name" value="<%= pythonEnvName %>" spellcheck="false" placeholder="environment name" oninput="handleNewEnvNameInputChange(this);">
                  <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                </jp-text-field>
              </div>
              <div class="row">
                <label id="env-install-path-label"></label>
              </div>
            </div>

            <div class="setting-section" id="env-type-section">
              <div class="header">
              Environment type
              </div>
              <div class="row">
              <jp-radio-group orientation="horizontal">
                <jp-radio id="env-type-conda" name="new-env-type" value="light" checked onchange="handleEnvTypeChange(this);">conda</jp-radio>
                <jp-radio id="env-type-venv" name="new-env-type" value="dark" onchange="handleEnvTypeChange(this);">venv</jp-radio>
              </jp-radio-group>
              </div>
            </div>

            <div class="setting-section" id="packages-section">
              <div class="header">
              Python packages to install
              </div>
              <div class="row">
                <jp-checkbox id='include-jupyterlab' type='checkbox' checked onchange='handleIncludeJupyterLabChange(this);'>Include jupyterlab (required for use in JupyterLab Desktop)</jp-checkbox>
              </div>
              <div class="header">
              Additional Python packages
              </div>
              <div class="row">
                <jp-text-area id='package-list' appearance="outline" resize="none" rows="1" value="" oninput='handleAdditionalServerEnvsInput(this);' spellcheck="false" placeholder='Enter additional package list separated by space'>
                </jp-text-area>
              </div>
            </div>

            <div class="setting-section" id="create-command-preview-section">
              <div class="header">
              Environment create command preview
              </div>
              <div class="row">
              <jp-text-area id='create-command-preview' appearance="outline" resize="none" rows="1" readonly="" style="width: 100%;" spellcheck="false"></jp-text-area>
              </div>
            </div>

            <div class="setting-section">
              <div class="row create-env-action-row">
                <jp-button id="create" appearance="accent" onclick='handleCreate(this);'>Create</jp-button>
                <div id="progress-animation" class="progress-animation"><jp-progress-ring></jp-progress-ring></div>
                <div id="progress-message" class="progress-message"></div>
                <jp-button id="toggle-install-output" onclick='toggleInstallOutput(this);'>Show output</jp-button>
                <jp-button id="clear-create-form" onclick='clearCreateForm(this);'>Clear form</jp-button>
              </div>
            </div>

            <div class="setting-section" style="flex-grow: 1;">
              <div class="row" id="create-env-output-row" style="height: 100%;">
                <jp-text-area id='create-env-output' appearance="outline" resize="vertical" rows="3" readonly="" style="width: 100%; font-family: monospace;" spellcheck="false" placeholder='install output will appear here'></jp-text-area>
              </div>
            </div>
          </div>
        </jp-tab-panel>

        <jp-tab-panel id="tab-panel-settings">
          <div class="tab-panel-content">
            <div class="setting-section">
              <div class="header">
                Default Python path for JupyterLab Server<div class="info-icon" title="Python executable to use when launching a new JupyterLab server. The Python environment needs to have 'jupyterlab' Python package installed.">${infoIconSrc}</div>
              </div>
              <div id="content-local-server" style="width: 100%;">
                <div style="display: flex; flex-direction: column; row-gap: 5px;">
                  <div id="bundled-env-warning">
                    <span id="bundled-env-warning-message"></span>
                    <jp-button id='install-bundled-env' onclick='handleInstallBundledEv(this);'>Install</jp-button>
                    <jp-button id='update-bundled-env' onclick='handleUpdateBundledEv(this);'>Update</jp-button>
                    <div id="progress-animation-bundled-env-install" class="progress-animation"><jp-progress-ring></jp-progress-ring></div>
                    <div id="progress-message-bundled-env-install" class="progress-message"></div>
                  </div>
                  <jp-radio-group orientation="vertical">
                    <jp-radio type="radio" id="bundled-env" name="env_type" value="bundled-env" <%= selectBundledPythonPath ? 'checked' : '' %> <%= !bundledEnvInstallationExists ? 'disabled' : '' %> onchange="handleDefaultPythonEnvTypeChange(this);">Use bundled Python environment installation</jp-radio>
                    <jp-radio type="radio" id="custom-env" name="env_type" value="custom-env" <%= !selectBundledPythonPath ? 'checked' : '' %> onchange="handleDefaultPythonEnvTypeChange(this);">Use custom Python environment</jp-radio>
                  </jp-radio-group>

                  <div class="row">
                    <div style="flex-grow: 1;">
                      <jp-text-field type="text" id="python-path" value="<%= defaultPythonPath %>" style="width: 100%;" spellcheck="false" oninput="handleCustomPythonPathChange(this);">
                        <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                      </jp-text-field>
                    </div>
                    <div>
                      <jp-button id='select-python-path' onclick='handleSelectPythonPath(this);'>Select path</jp-button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="setting-section">
              <div class="header">
                New Python environment install directory<div class="info-icon" title="Parent directory where new Python environments will be created">${infoIconSrc}</div>
              </div>
              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id='python-env-install-directory' value="<%= pythonEnvInstallPath %>" style="width: 100%;" spellcheck="false" oninput="handlePythonEnvsDirInputChange(this);">
                    <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                  </jp-text-field>
                </div>
                <div>
                  <jp-button onclick='handleSelectPythonEnvInstallDirectory(this);'>Select path</jp-button>
                </div>
              </div>
            </div>

            <div class="setting-section">
              <div class="header">
                conda path<div class="info-icon" title="conda executable to use when creating new conda environments, or running conda commands">${infoIconSrc}</div>
              </div>
              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id="conda-path" value="<%= condaPath %>" style="width: 100%;" spellcheck="false" oninput="handleCondaPathInputChange(this);">
                    <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                  </jp-text-field>
                </div>
                <div>
                  <jp-button onclick='handleSelectCondaPath(this);'>Select path</jp-button>
                </div>
              </div>
            </div>

            <div class="setting-section conda-channels-section">
              <div class="header">
                conda channels<div class="info-icon" title="List of conda channels (separated by space) to use when installing new conda packages">${infoIconSrc}</div>
              </div>
              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id="conda-channels" value="<%= condaChannels %>" style="width: 100%;" spellcheck="false" oninput="handleCondaChannelsInputChange(this);">
                    <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                  </jp-text-field>
                </div>
              </div>
            </div>

            <div class="setting-section">
              <div class="header">
                Python path to use when creating venv environments<div class="info-icon" title="Python executable to use when creating new venv environments">${infoIconSrc}</div>
              </div>
              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id="system-python-path" value="<%- systemPythonPath %>" style="width: 100%;" spellcheck="false" oninput="handleSystemPythonPathInputChange(this);">
                    <div slot="end"><div class="valid-icon">${checkIconSrc}</div><div class="invalid-icon">${xMarkCircleIconSrc}</div></div>
                  </jp-text-field>
                </div>
                <div>
                  <jp-button id='select-system-python-path' onclick='handleSelectSystemPythonPath(this);'>Select path</jp-button>
                </div>
              </div>
            </div>
          </div>
        </jp-tab-panel>
      </jp-tabs>

      </div>
      <script>
        const envListProgress = document.getElementById('env-list-progress');
        const envListProgressMessage = document.getElementById('env-list-progress-message');
        const envListProgressMessageContent = document.getElementById('env-list-progress-message-content');
        const bundledEnvRadio = document.getElementById('bundled-env');
        const customEnvRadio = document.getElementById('custom-env');
        const pythonPathInput = document.getElementById('python-path');
        const selectPythonPathButton = document.getElementById('select-python-path');
        const bundledEnvWarningContainer = document.getElementById('bundled-env-warning');
        const bundledEnvWarningMessage = document.getElementById('bundled-env-warning-message');
        const installBundledEnvButton = document.getElementById('install-bundled-env');
        const updateBundledEnvButton = document.getElementById('update-bundled-env');
        
        const createCopyOfBundledEnvRadio = document.getElementById('create-copy-of-bundled-env');
        const createNewEnvRadio = document.getElementById('create-new-env');
        const envTypeSection = document.getElementById('env-type-section');
        const envTypeCondaRadio = document.getElementById('env-type-conda');
        const envTypeVenvRadio = document.getElementById('env-type-venv');
        const packagesSection = document.getElementById('packages-section');
        const createCommandPreviewSection = document.getElementById('create-command-preview-section');

        const includeJupyterLabCheckbox = document.getElementById('include-jupyterlab');
        const packageListInput = document.getElementById('package-list');
        const newEnvNameInput = document.getElementById('new-env-name');
        const envInstallPathLabel = document.getElementById('env-install-path-label');
        const createCommandPreview = document.getElementById('create-command-preview');
        const createButton = document.getElementById('create');
        const progressMessageBundledEnvInstall = document.getElementById('progress-message-bundled-env-install');
        const progressAnimationBundledEnvInstall = document.getElementById('progress-animation-bundled-env-install');

        const progressMessageCreateNew = document.getElementById('progress-message');
        const progressAnimationCreateNew = document.getElementById('progress-animation');
        const createEnvOutputRow = document.getElementById('create-env-output-row');
        const createEnvOutput = document.getElementById('create-env-output');
        const toggleInstallOutputButton = document.getElementById('toggle-install-output');
        const clearCreateFormButton = document.getElementById('clear-create-form');
        const envListContainer = document.getElementById('env-list');

        const pythonEnvInstallDirectoryInput = document.getElementById('python-env-install-directory');
        const condaPathInput = document.getElementById('conda-path');
        const condaChannelsInput = document.getElementById('conda-channels');
        const systemPythonPathInput = document.getElementById('system-python-path');
        const categoryTabs = document.getElementById('category-tabs');

        let defaultPythonEnvChanged = false;
        let installingJupyterLabServerEnv = false;
        let selectingCustomJupyterLabServerPython = false;
        let condaPath = <%- JSON.stringify(condaPath) %>;
        let condaChannels = '<%- condaChannels %>';
        let systemPythonPath = <%- JSON.stringify(systemPythonPath) %>;

        let envs = <%- JSON.stringify(envs) %>;
        const pythonEnvInstallPath = <%- JSON.stringify(pythonEnvInstallPath) %>;
        const pathSeparator = ${JSON.stringify(path.sep)};
        const debounceWait = 200;
        let nameInputValid = false;
        let nameInputValidationTimer = -1;
        let customPythonPathInputValidationTimer = -1;
        let envsDirInputValidationTimer = -1;
        let condaPathInputValidationTimer = -1;
        let condaChannelsInputValidationTimer = -1;
        let systemPythonPathInputValidationTimer = -1;

        function handleEnvMenuClick(el) {
          const menuItem = el.closest('jp-menu-item');
          const pythonPath = menuItem.dataset.pythonPath;
          window.electronAPI.showPythonEnvironmentContextMenu(pythonPath);
        }

        function handleDefaultPythonEnvTypeChange() {
          defaultPythonEnvChanged = true;
          const useBundledEnv = bundledEnvRadio.checked;
          if (useBundledEnv) {
            pythonPathInput.setAttribute('disabled', 'disabled');
            selectPythonPathButton.setAttribute('disabled', 'disabled');
            window.electronAPI.setDefaultPythonPath('');
            pythonPathInput.value = ${JSON.stringify(bundledPythonPath)};
            validateAndUpdateCustomPythonPath();
          } else {
            pythonPathInput.removeAttribute('disabled');
            selectPythonPathButton.removeAttribute('disabled');
            if (isInputValid(pythonPathInput)) {
              window.electronAPI.setDefaultPythonPath(pythonPathInput.value);
            }
          }
        }

        function handleSelectPythonPath(el) {
          selectingCustomJupyterLabServerPython = true;
          window.electronAPI.selectPythonPath();
        }

        function handleSelectPythonEnvInstallDirectory() {
          window.electronAPI.selectDirectoryPath(pythonEnvInstallDirectoryInput.value).then(selected => {
            pythonEnvInstallDirectoryInput.value = selected;
            handlePythonEnvsDirInputChange();
          });
        }

        function handleSelectCondaPath(el) {
          window.electronAPI.selectFilePath(condaPathInput.value).then(selected => {
            condaPathInput.value = selected;
            handleCondaPathInputChange();
          });
        }

        function handleSelectSystemPythonPath(el) {
          window.electronAPI.selectFilePath(systemPythonPathInput.value).then(selected => {
            systemPythonPathInput.value = selected;
            handleSystemPythonPathInputChange();
          });
        }

        function showEnvListProgress(show) {
          envListProgress.style.display = show ? 'block' : 'none';
        }

        function setEnvListProgressMessage(message) {
          envListProgressMessageContent.innerText = message;
          envListProgressMessage.style.display = message ? 'flex' : 'none';
        }

        function showBundledEnvWarning(type) {
          if (type === 'does-not-exist') {
            bundledEnvWarningMessage.innerText = 'Bundled environment installation not found';
            installBundledEnvButton.style.display = 'block';
            bundledEnvWarningContainer.classList.add('warning');
          } else {
            bundledEnvWarningMessage.innerText = 'Updates available for the bundled environment installation';
            updateBundledEnvButton.style.display = 'block';
            bundledEnvWarningContainer.classList.add('warning');
          }
          bundledEnvWarningContainer.style.display = 'flex';
        }

        function hideBundledEnvWarning() {
          bundledEnvWarningContainer.style.display = 'none';
        }

        function handleInstallBundledEv() {
          installingJupyterLabServerEnv = true;
          installBundledEnvButton.setAttribute('disabled', 'disabled');
          window.electronAPI.installBundledPythonEnv();
        }

        function handleUpdateBundledEv() {
          window.electronAPI.updateBundledPythonEnv();
        }

        function showBundledEnvInstallProgress(message, animate) {
          progressMessageBundledEnvInstall.innerText = message;
          progressMessageBundledEnvInstall.style.visibility = message !== '' ? 'visible' : 'hidden';
          progressAnimationBundledEnvInstall.style.visibility = animate ? 'visible' : 'hidden';
        }

        function showProgressCreateNew(message, animate) {
          progressMessageCreateNew.innerText = message;
          progressMessageCreateNew.style.visibility = message !== '' ? 'visible' : 'hidden';
          progressAnimationCreateNew.style.visibility = animate ? 'visible' : 'hidden';
        }

        function handleAddExistingEnv(el) {
          selectingCustomJupyterLabServerPython = false;
          window.electronAPI.browsePythonPath();
        }

        function handleCreateNewEnvLink() {
          categoryTabs.setAttribute('activeid', 'tab-create');
        }

        function handleEnvTypeChange() {
          updateCreateCommandPreview();
        }

        function getEnvTooltip(env) {
          const packages = [];
          for (const name in env.versions) {
            packages.push(name + ': ' + env.versions[name]);
          }
          return env.name + '\\n' + env.path + '\\n' + packages.join(', ');
        }
        function getEnvTag(env) {
          return env.path === ${JSON.stringify(
            defaultPythonPath
          )} ? ' (default)' : env.path === ${JSON.stringify(
      bundledPythonPath
    )} ? ' (bundled)' : '';
        }

        function generateEnvTypeList(name, envs) {
          let html = '<jp-menu-item class="menu-category"><div slot="start">' + name + ' (' + envs.length + ')</div></jp-menu-item>';
          for (const env of envs) {
            html += \`
            <jp-menu-item data-python-path="\$\{env.path\}" title="\$\{getEnvTooltip(env)\}">
              <div slot="start">\$\{env.path\}</div>
              <div slot="end"><div class="env-right-content">\$\{env.name\}\$\{getEnvTag(env)\}<div class="env-menu-icon" title="Show menu" onclick="handleEnvMenuClick(this);">${menuIconSrc}</div></div></div>
            </jp-menu-item>
            \`;
          }

          return html;
        }

        function fetchPythonEnvironmentList() {
          return window.electronAPI.getPythonEnvironmentList(true);
        }

        function updatePythonEnvironmentList() {
          while (envListContainer.lastElementChild) {
            envListContainer.removeChild(envListContainer.lastElementChild);
          }

          // sort by Python path
          const sortedEnvs = envs.sort((lhs, rhs) => lhs.path.localeCompare(rhs.path));

          const condaEnvs = sortedEnvs.filter(
            env =>
              env.type === 'conda-env' ||
              env.type === 'conda-root'
          );
          const venvEnvs = sortedEnvs.filter(
            env => env.type === 'venv'
          );
          const globalEnvs = sortedEnvs.filter(
            env => env.type === 'path'
          );

          let html = '';

          if (condaEnvs.length > 0) {
            html += generateEnvTypeList('conda', condaEnvs);
          }
          if (venvEnvs.length > 0) {
            html += generateEnvTypeList('venv', venvEnvs);
          }
          if (globalEnvs.length > 0) {
            html += generateEnvTypeList('global', globalEnvs);
          }

          envListContainer.innerHTML = html || 'No Python environment found.';
        }

        async function clearCreateForm() {
          newEnvNameInput.value = await window.electronAPI.getNextPythonEnvironmentName();
          createCopyOfBundledEnvRadio.checked = true;
          envTypeCondaRadio.checked = true;
          includeJupyterLabCheckbox.checked = true;
          packageListInput.value = '';
          createEnvOutput.value = '';
          createEnvOutputRow.style.display = "none";
          toggleInstallOutputButton.style.display = 'none';
          clearCreateFormButton.style.display = 'none';
          handleNewEnvNameInputChange();
          showProgressCreateNew('');
          createButton.disabled = false;
        }

        function toggleInstallOutput() {
          if (createEnvOutputRow.style.display !== 'flex') {
            createEnvOutputRow.style.display = 'flex';
            toggleInstallOutputButton.innerText = 'Hide output';
          } else {
            createEnvOutputRow.style.display = 'none';
            toggleInstallOutputButton.innerText = 'Show output';
          }
        }

        function handleCreate() {
          installingJupyterLabServerEnv = false;
          createButton.disabled = true;
          const createCopyOfBundledEnv = createCopyOfBundledEnvRadio.checked;
          const envPath = getEnvInstallPath();
          const isConda = envTypeCondaRadio.checked;
          const envType = isConda ? 'conda' : 'venv';
          if (createCopyOfBundledEnv) {
            window.electronAPI.installBundledPythonEnv(envPath);
          } else {
            window.electronAPI.createNewPythonEnvironment(envPath, envType, getPackageList());
            toggleInstallOutputButton.style.display = 'block';
          }
        }

        function getPackageList() {
          const includeJupyterLab = includeJupyterLabCheckbox.checked;
          let packages = includeJupyterLab ? 'jupyterlab ' : '';
          const packageListValue = packageListInput.value?.trim();
          if (packageListValue) {
            packages += packageListValue;
          }

          return packages;
        }

        function handleIncludeJupyterLabChange() {
          updateCreateCommandPreview();
        }

        function handleAdditionalServerEnvsInput() {
          updateCreateCommandPreview();
        }

        function updateCreateCommandPreview() {
          const isConda = envTypeCondaRadio.checked;
          if (isConda) {
            createCommandPreview.value = \`conda create -p \$\{getEnvInstallPath()\} \$\{getCondaChannels()\}\ \$\{getPackageList()\}\`;
          } else {
            const envPath = getEnvInstallPath();
            createCommandPreview.value = \`python -m venv \$\{envPath\}\n\$\{envPath\}\$\{pathSeparator\}${activateRelPath.replace(
              '\\',
              '\\\\'
            )}\npython -m pip install \$\{getPackageList()\}\`;
          }
        }

        let scrollTimeout = -1;

        async function handleInstallBundledPythonEnvStatusCreateNew(status, msg) {
          if (status === 'RUNNING') {
            createEnvOutput.value = createEnvOutput.value + msg;
            const textarea = createEnvOutput.shadowRoot.getElementById('control');
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
              textarea.scrollTop = textarea.scrollHeight;
            }, 100);
            return;
          }

          const message = status === 'REMOVING_EXISTING_INSTALLATION' ?
            'Removing the existing installation' :
            status === 'STARTED' ?
            'Installing Python environment' :
            status === 'CANCELLED' ?
            'Installation cancelled!' :
            status === 'FAILURE' ?
              msg || 'Failed to install the environment!' :
            status === 'SUCCESS' ? 'Installation succeeded' : '';
          
          const animate = status === 'REMOVING_EXISTING_INSTALLATION'
            || status === 'STARTED';

          showProgressCreateNew(message, animate);

          if (!(status === 'REMOVING_EXISTING_INSTALLATION' || status === 'STARTED')) {
            clearCreateFormButton.style.display = 'block';
          }
        }

        async function handleInstallBundledPythonEnvStatusJupyterLabServerEnv(status, msg) {
          const message = status === 'REMOVING_EXISTING_INSTALLATION' ?
            'Removing the existing installation' :
            status === 'STARTED' ?
            'Installing Python environment' :
            status === 'CANCELLED' ?
            'Installation cancelled!' :
            status === 'FAILURE' ?
              'Failed to install the environment!' :
            status === 'SUCCESS' ? 'Installation succeeded' : '';
          
          const animate = status === 'REMOVING_EXISTING_INSTALLATION'
            || status === 'STARTED';

          showBundledEnvInstallProgress(message, animate);

          if (status === 'SUCCESS') {
            bundledEnvRadio.removeAttribute('disabled');
            hideBundledEnvWarning();
          }

          installBundledEnvButton.removeAttribute('disabled');
          applyButton.removeAttribute('disabled');
        }

        window.electronAPI.onInstallBundledPythonEnvStatus((status, msg) => {
          if (installingJupyterLabServerEnv) {
            handleInstallBundledPythonEnvStatusJupyterLabServerEnv(status, msg);
          } else {
            handleInstallBundledPythonEnvStatusCreateNew(status, msg);
          }
        });

        function getEnvironmentValidationErrorMessage(error) {
          let message = 'Invalid Python path selected';

          if (!error) {
            return message;
          }

          if (error.type === 'path-not-found') {
            message = 'File not found at the selected path';
          } else if (error.type === 'invalid-python-binary') {
            message = 'File selected is not a Python binary';
          } else if (error.type === 'requirements-not-satisfied') {
            message = 'Required Python package (jupyterlab) not found in the selected environment. Install in the selected environment and retry.';
          } else if (error.type === PythonEnvResolveErrorType.ResolveError) {
            message = 'Failed to get environment information at selected path';
          }

          return message;
        }

        async function handleCustomPythonPathSelectedForAddExistingEnv(path) {
          showEnvListProgress(true);
          const inRegistry = await window.electronAPI.getEnvironmentByPythonPath(path);
          if (!inRegistry) {
            const validateResult = await window.electronAPI.validatePythonPath(path);
            if (validateResult.valid) {
              await window.electronAPI.addEnvironmentByPythonPath(path);
            } else {
              setEnvListProgressMessage(getEnvironmentValidationErrorMessage(validateResult.error));
            }
          } else {
            setEnvListProgressMessage('Environment is already in registry.');
          }
          showEnvListProgress(false);
        }

        async function handleCustomPythonPathSelectedForCustomJupyterLabServer(path) {
          pythonPathInput.value = path;
          handleCustomPythonPathChange();
        }

        window.electronAPI.onCustomPythonPathSelected((path) => {
          if (selectingCustomJupyterLabServerPython) {
            handleCustomPythonPathSelectedForCustomJupyterLabServer(path);
          } else {
            handleCustomPythonPathSelectedForAddExistingEnv(path);
          }
        });

        window.electronAPI.onSetPythonEnvironmentList((newEnvs) => {
          envs = newEnvs;
          updatePythonEnvironmentList();
        });

        window.electronAPI.onEnvironmentListUpdateStatus((status, message) => {
          if (status === 'ENV-DELETE-RUNNING') {
            showEnvListProgress(true);
          } else if (status === 'ENV-DELETE-FINISHED' || status === 'ENV-DELETE-FAILED') {
            showEnvListProgress(false);
          }
          setEnvListProgressMessage(message || '');
        });

        function handleNewEnvCreateMethodChange() {
          defaultPythonEnvChanged = true;
          const createCopyOfBundledEnv = createCopyOfBundledEnvRadio.checked;
          if (createCopyOfBundledEnv) {
            envTypeSection.style.display = 'none';
            packagesSection.style.display = 'none';
            createCommandPreviewSection.style.display = 'none';
          } else {
            envTypeSection.style.display = 'flex';
            packagesSection.style.display = 'flex';
            createCommandPreviewSection.style.display = 'flex';
          }
        }

        function getEnvInstallPath() {
          return \`\$\{pythonEnvInstallPath + pathSeparator + newEnvNameInput.value\}\`;
        }

        function getCondaChannels() {
          if (condaChannels.trim() === '') {
            return '';
          }
          return condaChannels.split(' ').map(channel => \`-c \$\{channel\}\`).join(' ');
        }

        function handleCustomPythonPathChange() {
          validateAndUpdateCustomPythonPath();
        }

        function handleNewEnvNameInputChange() {
          envInstallPathLabel.innerText = \`Installation path: "\$\{getEnvInstallPath()\}"\`;
          updateCreateCommandPreview();
          validateNameInput();
        }

        function handlePythonEnvsDirInputChange() {
          validateAndUpdatePythonEnvsDir();
        }

        function handleCondaPathInputChange() {
          validateAndUpdateCondaPath();
        }

        function handleCondaChannelsInputChange() {
          validateAndUpdateCondaChannels();
        }

        function handleSystemPythonPathInputChange() {
          validateAndUpdateSystemPythonPath();
        }

        function isInputValid(input) {
          const validIcon = input.getElementsByClassName('valid-icon')[0];
          return validIcon.style.display === 'block';
        }
        function showInputValidStatus(input, valid, message) {
          const validIcon = input.getElementsByClassName('valid-icon')[0];
          const invalidIcon = input.getElementsByClassName('invalid-icon')[0];
          validIcon.style.display = valid ? 'block' : 'none';
          invalidIcon.style.display = valid ? 'none' : 'block';
          invalidIcon.title = message || '';
        }
        function clearInputValidStatus(input) {
          const validIcon = input.getElementsByClassName('valid-icon')[0];
          const invalidIcon = input.getElementsByClassName('invalid-icon')[0];
          validIcon.style.display = 'none';
          invalidIcon.style.display = 'none';
        }

        function validateNameInput() {
          clearTimeout(nameInputValidationTimer);
          nameInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(newEnvNameInput);
            const response = await window.electronAPI.validateNewPythonEnvironmentName(newEnvNameInput.value);
            showInputValidStatus(newEnvNameInput, response.valid, response.message);
            nameInputValid = response.valid;
            updateCreateButtonState();
          }, debounceWait);
        }

        function validateAndUpdatePythonEnvsDir() {
          clearTimeout(envsDirInputValidationTimer);
          envsDirInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(pythonEnvInstallDirectoryInput);
            const response = await window.electronAPI.validatePythonEnvironmentInstallDirectory(pythonEnvInstallDirectoryInput.value);
            showInputValidStatus(pythonEnvInstallDirectoryInput, response.valid, response.message);
            if (response.valid) {
              window.electronAPI.setPythonEnvironmentInstallDirectory(pythonEnvInstallDirectoryInput.value);
            }
          }, debounceWait);
        }

        function validateAndUpdateCustomPythonPath() {
          clearTimeout(customPythonPathInputValidationTimer);
          customPythonPathInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(pythonPathInput);

            let valid = false;
            let message = '';
            const pythonPath = pythonPathInput.value;
            const inRegistry = await window.electronAPI.getEnvironmentByPythonPath(pythonPath);
            if (inRegistry) {
              valid = true;
            } else {
              const validateResult = await window.electronAPI.validatePythonPath(pythonPath);
              if (validateResult.valid) {
                await window.electronAPI.addEnvironmentByPythonPath(pythonPath);
                valid = true;
              } else {
                valid = false;
                message = getEnvironmentValidationErrorMessage(validateResult.error);
              }
            }
            if (valid && !bundledEnvRadio.checked) {
              window.electronAPI.setDefaultPythonPath(pythonPathInput.value);
            }
            showInputValidStatus(pythonPathInput, valid, message);
          }, debounceWait);
        }

        function validateAndUpdateCondaPath() {
          clearTimeout(condaPathInputValidationTimer);
          condaPathInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(condaPathInput);
            const response = await window.electronAPI.validateCondaPath(condaPathInput.value);
            showInputValidStatus(condaPathInput, response.valid, response.message);
            if (response.valid) {
              condaPath = condaPathInput.value;
              window.electronAPI.setCondaPath(condaPath);
            }
          }, debounceWait);
        }

        function validateAndUpdateCondaChannels() {
          clearTimeout(condaChannelsInputValidationTimer);
          condaChannelsInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(condaChannelsInput);
            const response = await window.electronAPI.validateCondaChannels(condaChannelsInput.value);
            showInputValidStatus(condaChannelsInput, response.valid, response.message);
            if (response.valid) {
              condaChannels = condaChannelsInput.value;
              window.electronAPI.setCondaChannels(condaChannels);
            }
          }, debounceWait);
        }

        function validateAndUpdateSystemPythonPath() {
          clearTimeout(systemPythonPathInputValidationTimer);
          systemPythonPathInputValidationTimer = setTimeout(async () => {
            clearInputValidStatus(systemPythonPathInput);
            const response = await window.electronAPI.validateSystemPythonPath(systemPythonPathInput.value);
            showInputValidStatus(systemPythonPathInput, response.valid, response.message);
            if (response.valid) {
              systemPythonPath = systemPythonPathInput.value;
              window.electronAPI.setSystemPythonPath(systemPythonPath);
            }
          }, debounceWait);
        }

        function updateCreateButtonState() {
          createButton.disabled = !nameInputValid;
        }

        function updateCreateNewEnvOptions() {
          createNewEnvRadio.title = '';
          envTypeCondaRadio.title = '';
          envTypeVenvRadio.title = '';

          if (!condaPath && !systemPythonPath) { // neither available
            createNewEnvRadio.disabled = true;
            createNewEnvRadio.title = 'conda and system Python path not found. You can set in the settings tab.';
            createCopyOfBundledEnvRadio.checked = true;
          } else if (!condaPath) { // only venv available
            createNewEnvRadio.disabled = false;
            envTypeCondaRadio.disabled = true;
            envTypeCondaRadio.title = 'conda path not found. You can set in the settings tab.';
            envTypeVenvRadio.disabled = false;
            envTypeVenvRadio.checked = true;
          } else if (!systemPythonPath) { // only conda available
            createNewEnvRadio.disabled = false;
            envTypeCondaRadio.disabled = false;
            envTypeVenvRadio.disabled = true;
            envTypeVenvRadio.title = 'System Python path not found. You can set in the settings tab.';
            envTypeCondaRadio.checked = true;
          } else {
            createNewEnvRadio.disabled = false;
            envTypeCondaRadio.disabled = false;
            envTypeVenvRadio.disabled = false;
          }

          updateCreateCommandPreview();
        }

        document.addEventListener("DOMContentLoaded", () => {
          updatePythonEnvironmentList();
          handleDefaultPythonEnvTypeChange();
          handleNewEnvCreateMethodChange();
          handleNewEnvNameInputChange();

          const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
              if (mutation.type === "attributes" && mutation.attributeName === "activeid") {
                if (categoryTabs.getAttribute('activeid') === 'tab-create') {
                  updateCreateNewEnvOptions();
                }
              }
            });
          });
          
          observer.observe(categoryTabs, { attributes: true });

          <%- !bundledEnvInstallationExists ? 'showBundledEnvWarning("does-not-exist");' : '' %> 
          <%- (bundledEnvInstallationExists && !bundledEnvInstallationLatest) ? 'showBundledEnvWarning("not-latest");' : '' %>
          ${
            options.activateTab
              ? `
              categoryTabs.setAttribute('activeid', 'tab-${options.activateTab}');
              `
              : ''
          }
          setTimeout(() => {
            handlePythonEnvsDirInputChange();
            handleCustomPythonPathChange();
            handleCondaPathInputChange();
            handleCondaChannelsInputChange();
            handleSystemPythonPathInputChange();
          }, 1000);
        });
      </script>
    `;
    this._pageBody = ejs.render(template, {
      envs: options.envs,
      defaultPythonPath,
      selectBundledPythonPath,
      bundledEnvInstallationExists,
      bundledEnvInstallationLatest,
      pythonEnvName,
      pythonEnvInstallPath,
      condaPath,
      condaChannels,
      systemPythonPath
    });
  }

  get window(): BrowserWindow {
    return this._window.window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);

    this._app.registry.environmentListUpdated.connect(
      this._onEnvironmentListUpdated,
      this
    );

    this._window.window.on('closed', () => {
      this._app.registry.environmentListUpdated.disconnect(
        this._onEnvironmentListUpdated,
        this
      );
      this._evm.dispose();
    });
  }

  setPythonEnvironmentList(envs: IPythonEnvironment[]) {
    this._window.window.webContents.send(
      EventTypeRenderer.SetPythonEnvironmentList,
      envs
    );
  }

  private async _onEnvironmentListUpdated() {
    const envs = await this._app.registry.getEnvironmentList(true);
    this.setPythonEnvironmentList(envs);
  }

  private _window: ThemedWindow;
  private _pageBody: string;
  private _evm = new EventManager();
  private _app: JupyterApplication;
}

export namespace ManagePythonEnvironmentDialog {
  export enum Tab {
    Environments = 'envs',
    Create = 'create',
    Settings = 'settings'
  }

  export interface IOptions {
    isDarkTheme: boolean;
    app: JupyterApplication;
    envs: IPythonEnvironment[];
    defaultPythonPath: string;
    activateTab?: Tab;
    bundledEnvInstallationExists: boolean;
    bundledEnvInstallationLatest: boolean;
  }
}
