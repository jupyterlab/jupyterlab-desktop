// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import { JupyterLabWindow } from '../dialog/jupyterlabwindow';
import { Registry } from '../registry';

export class ServerConfigDialog {
  constructor(options: ServerConfigDialog.IOptions) {
    this._window = new JupyterLabWindow({
      title: 'Server Configuration',
      width: 700,
      height: 400,
      preload: path.join(__dirname, './preload.js')
    });

    const bundledPythonPath = options.bundledPythonPath;
    const pythonPath = options.pythonPath;
    let checkBundledPythonPath = false;
    if (
      options.reason === 'invalid-bundled-env' ||
      pythonPath === '' ||
      pythonPath === bundledPythonPath
    ) {
      checkBundledPythonPath = true;
    }
    const configuredPath = pythonPath === '' ? bundledPythonPath : pythonPath;
    const remoteServerUrl = options.remoteURL;
    const persistSessionData = options.persistSessionData;
    const requirements = options.envRequirements;
    const reqVersions = requirements.map(
      req => `${req.name} ${req.versionRange.format()}`
    );
    const reqList = reqVersions.join(', ');

    const message = !(
      options.reason === 'invalid-bundled-env' ||
      options.reason === 'invalid-env'
    )
      ? `Select the Python executable in the conda or virtualenv environment you would like to use for JupyterLab Desktop. Python packages in the environment selected need to meet the following requirements: ${reqList}. Prebuilt extensions installed in the selected environment will also be available in JupyterLab Desktop.`
      : ejs.render(
          `Failed to find a compatible Python environment at the configured path "<%= configuredPath %>". Environment Python package requirements are: ${reqList}.`,
          { configuredPath }
        );

    const template = `
      <style>
        .row {display: flex; align-items: center;}
        .row.error {color: rgb(231, 92, 88);}
        .radio-row {align-items: center;}
        .progress-message {margin-right: 5px; line-height: 24px; visibility: hidden;}
        .progress-animation {margin-right: 5px; visibility: hidden;}
        #server-url { outline: none; }
        #server-url:invalid { border-color: red; }
        .server-type-content { padding-left: 20px;}
      </style>
      <div id="server-config-section" style="height: 100%;display: flex; flex-direction: column; row-gap: 5px;">
        <div style="flex-grow: 1; overflow-y: auto;">
          <jp-radio-group orientation="horizontal">
            <jp-radio type="radio" id="use-local-server" name="server_type" value="local-server" <%= !remoteServerUrl ? 'checked' : '' %> onchange="handleServerTypeChange(this);">
              Start new local JupyterLab Server
            </jp-radio>
            <jp-radio type="radio" id="use-remote-server" name="server_type" value="remote-server" <%= remoteServerUrl ? 'checked' : '' %> onchange="handleServerTypeChange(this);">
              Connect to remote JupyterLab Server
            </jp-radio>
          </jp-radio-group>
          
          <div id="content-local-server" class="server-type-content">
            <div class="row" style="line-height: 30px;">
              <b>Local Python Environment</b>
            </div>
            <div class="row">
              ${message}
            </div>
            <div style="display: flex; flex-direction: column; row-gap: 5px;">
              <jp-radio-group orientation="vertical">
              <% if (reason === 'invalid-bundled-env') { %>
                <jp-radio type="radio" id="install-new" name="env_type" value="install-new" checked onchange="handleEnvTypeChange(this);">Install Python environment using the bundled installer</jp-radio>
              <% } else { %>
                <jp-radio type="radio" id="bundled" name="env_type" value="bundled" <%= checkBundledPythonPath ? 'checked' : '' %> onchange="handleEnvTypeChange(this);">Use the bundled Python environment</jp-radio>
              <% } %>
                <jp-radio type="radio" id="custom" name="env_type" value="custom" <%= !checkBundledPythonPath ? 'checked' : '' %> onchange="handleEnvTypeChange(this);">Use a custom Python environment</jp-radio>
              </jp-radio-group>

              <div class="row">
                <div style="flex-grow: 1;">
                  <jp-text-field type="text" id="python-path" value="<%= pythonPath %>" style="width: 100%;" spellcheck="false"></jp-text-field>
                </div>
                <div>
                  <jp-button id='select-python-path' onclick='handleSelectPythonPath(this);'>Select Python path</jp-button>
                </div>
              </div>
            </div>
          </div>

          <div id="content-remote-server" class="server-type-content">
            <% if (reason === 'remote-connection-failure') { %>
            <div class="row error">
              Failed to connect to remote server URL. Please check your connection settings and try again.
            </div>
            <% } %>
            <div class="row">
              Enter the URL of the existing JupyterLab Server including path to JupyterLab application (/lab) and the token as a query parameter (?token=value). If you choose 'Persist session data' option, then your session data including cookies and cache will be persisted for the next launch. If the connected JupyterLab Server requires additional authentication such as SSO then persisting the data would allow auto re-login.
            </div>
            <div class="row" style="line-height: 30px;">
              <b>Existing Server URL</b>
            </div>
            <div class="row">
              <div style="flex-grow: 1;">
                <jp-text-field type="url" pattern="https?://.*/lab.*" id="server-url" value="<%= remoteServerUrl %>" placeholder="https://example.org/lab?token=abcde" style="width: 100%;" spellcheck="false" required></jp-text-field>
              </div>
              <div>
                <jp-button id='validate-server-url' onclick='handleValidateServerUrl(this);'>Validate</jp-button>
              </div>
            </div>
            <div class="row">
              <div>
                <jp-checkbox type="checkbox" id="persist-session-data" <%= persistSessionData ? 'checked' : '' %>>Persist session data</jp-checkbox>
              </div>
              <div>
                <jp-button id='clear-session-data' onclick='handleClearSessionData(this);'>Clear session data</jp-button>
              </div>
            </div>
          </div>
        </div>

        <div class="row footer-row" style="height: 40px; overflow-y: hidden;justify-content: flex-end;">
          <div id="progress-message" class="progress-message"></div>  
          <div id="progress-animation" class="progress-animation"><jp-progress-ring></jp-progress-ring></div>
          <jp-button id="apply" onclick='handleApply(this);' style='margin-right: 5px;'>Apply & restart</jp-button>
        </div>
      </div>

        <script>
          let pythonPath = '';
          const useLocalServerRadio = document.getElementById('use-local-server');
          const useRemoteServerRadio = document.getElementById('use-remote-server');
          const localServerContentPanel = document.getElementById('content-local-server');
          const remoteServerContentPanel = document.getElementById('content-remote-server');
          const installNewRadio = document.getElementById('install-new');
          const bundledRadio = document.getElementById('bundled');
          const customRadio = document.getElementById('custom');
          const pythonPathInput = document.getElementById('python-path');
          const selectPythonPathButton = document.getElementById('select-python-path');
          const applyButton = document.getElementById('apply');
          const progressMessage = document.getElementById('progress-message');
          const progressAnimation = document.getElementById('progress-animation');
          const serverUrlInput = document.getElementById('server-url');
          const validateServerUrlButton = document.getElementById('validate-server-url');
          const persistSessionDataCheckbox = document.getElementById('persist-session-data');
          const clearSessionDataButton = document.getElementById('clear-session-data');

          function handleSelectPythonPath(el) {
            window.electronAPI.selectPythonPath();
          }
          function handleEnvTypeChange() {
            const installNewOrUseBundled = (installNewRadio && installNewRadio.checked) || (bundledRadio && bundledRadio.checked);
            if (installNewOrUseBundled) {
              pythonPathInput.setAttribute('disabled', 'disabled');
              selectPythonPathButton.setAttribute('disabled', 'disabled');
            } else {
              pythonPathInput.removeAttribute('disabled');
              selectPythonPathButton.removeAttribute('disabled');
            }
            
          }
          function handleServerTypeChange() {
            const useRemoteServer = useRemoteServerRadio && useRemoteServerRadio.checked;
            localServerContentPanel.style.display = useRemoteServer ? 'none' : 'block';
            remoteServerContentPanel.style.display = useRemoteServer ? 'block' : 'none';

            if (!useRemoteServer) {
              handleEnvTypeChange();
            }
          }

          function showProgress(message, animate) {
            progressMessage.innerText = message;
            progressMessage.style.visibility = message !== '' ? 'visible' : 'hidden';
            progressAnimation.style.visibility = animate ? 'visible' : 'hidden';
          }

          function handleValidateServerUrl(el) {
            showProgress('Validating URL', true);
            window.electronAPI.validateRemoteServerURL(serverUrlInput.value).then(response => {
              if (response.result === 'valid') {
                showProgress('JupyterLab Server connection test succeeded!', false);
                setTimeout(() => {
                  showProgress('', false);
                }, 5000);
              } else {
                showProgress('Error: ' + response.error, false);
              }
            });
          }

          function handleClearSessionData(el) {
            clearSessionDataButton.setAttribute('disabled', 'disabled');
            showProgress('Clearing session data', true);
            window.electronAPI.clearSessionData().then(result => {
              clearSessionDataButton.removeAttribute('disabled');
              showProgress('Session data cleared!', false);
              setTimeout(() => {
                showProgress('', false);
              }, 5000);
            });
          }

          function handleApply(el) {
            if (useLocalServerRadio.checked) {
              if (installNewRadio && installNewRadio.checked) {
                window.electronAPI.installBundledPythonEnv();
                showProgress('Installing environment', true);
                applyButton.setAttribute('disabled', 'disabled');
              } else if (bundledRadio && bundledRadio.checked) {
                window.electronAPI.setPythonPath('');
              } else {
                window.electronAPI.validatePythonPath(pythonPathInput.value).then((valid) => {
                  if (valid) {
                    window.electronAPI.setPythonPath(pythonPathInput.value);
                  } else {
                    window.electronAPI.showInvalidPythonPathMessage(pythonPathInput.value);
                  }
                });
              }
            } else {
              window.electronAPI.setRemoteServerURL(serverUrlInput.value, persistSessionDataCheckbox.checked);
            }
          }

          window.electronAPI.onCustomPythonPathSelected((path) => {
            pythonPathInput.value = path;
          });

          window.electronAPI.onInstallBundledPythonEnvResult((result) => {
            const message = result === 'CANCELLED' ?
              'Installation cancelled!' :
              result === 'FAILURE' ?
                'Failed to install the environment!' : '';
            showProgress(message, false);
            const disableButtons = result === 'SUCCESS';
            if (disableButtons) {
              applyButton.setAttribute('disabled', 'disabled');
            } else {
              applyButton.removeAttribute('disabled');
            }
          });

          handleServerTypeChange();
          handleEnvTypeChange();
        </script>
      </div>
        `;
    this._pageBody = ejs.render(template, {
      reason: options.reason,
      checkBundledPythonPath,
      pythonPath,
      remoteServerUrl,
      persistSessionData
    });
  }

  get window(): JupyterLabWindow {
    return this._window;
  }

  load() {
    this._window.loadDialogContent(this._pageBody);
  }

  private _window: JupyterLabWindow;
  private _pageBody: string;
}

export namespace ServerConfigDialog {
  export interface IOptions {
    reason:
      | 'change'
      | 'invalid-bundled-env'
      | 'invalid-env'
      | 'remote-connection-failure';
    bundledPythonPath: string;
    pythonPath: string;
    remoteURL: string;
    persistSessionData: boolean;
    envRequirements: Registry.IRequirement[];
  }
}
