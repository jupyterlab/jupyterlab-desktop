// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as ejs from 'ejs';
import * as path from 'path';
import { ThemedView } from '../dialog/themedview';
import { IEnvironmentType, IPythonEnvironment } from '../tokens';

export class PythonEnvironmentSelectPopup {
  constructor(options: PythonEnvironmentSelectView.IOptions) {
    this._view = new ThemedView({
      isDarkTheme: options.isDarkTheme,
      preload: path.join(__dirname, './preload.js')
    });

    const envs = [...options.envs];
    const bundledPythonPath = options.bundledPythonPath;
    const currentPythonPath =
      options.currentPythonPath === ''
        ? bundledPythonPath
        : options.currentPythonPath;

    if (!envs.find(env => env.path === bundledPythonPath)) {
      envs.unshift({
        path: bundledPythonPath,
        name: 'jlab_server',
        type: IEnvironmentType.CondaRoot,
        versions: {}
      });
    }

    if (!envs.find(env => env.path === currentPythonPath)) {
      envs.unshift({
        path: currentPythonPath,
        name: 'current',
        type: IEnvironmentType.CondaRoot,
        versions: {}
      });
    }

    const template = `
      <style>
        body {
          border-right: 1px solid #999999;
          border-bottom: 1px solid #999999;
          border-left: 1px solid #999999;
        }
        body.app-ui-dark {
          border-right: 1px solid #555555;
          border-bottom: 1px solid #555555;
          border-left: 1px solid #555555;
        }
        .row {display: flex; align-items: center;}
        .row.error {color: rgb(231, 92, 88);}
        .radio-row {align-items: center;}
        #python-path {
          outline: none;
        }
        #python-path::part(control) {
          padding-right: 50px;
        }
        #browse-button {
          width: 30px;
          position: absolute;
          margin: 10px;
          right: 0;
          height: 30px;
        }
        input {
          color-scheme: light;
        }
        .app-ui-dark input {
          color-scheme: dark;
        }
        .footer-row {
          margin-bottom: 5px;
          height: 40px;
          overflow-y: hidden;
          justify-content: flex-end;
        }
        #env-list {
          max-width: 100%;
          width: 100%;
        }
        jp-menu {
          background: none;
        }
        jp-menu-item.active {
          background: var(--neutral-layer-3);
        }
      </style>
      <div style="height: 100%; display: flex; flex-direction: column; row-gap: 5px;">
        <div>
          <div style="display: flex; flex-direction: row; align-items: center; flex-grow: 1;">
            <jp-text-field type="text" id="python-path" value="<%= currentPythonPath %>" style="width: 100%;" spellcheck="false" required title="Enter the Python path in the conda or virtualenv environment you would like to use for JupyterLab Desktop. Hit 'Return' key to apply and restart JupyterLab.">
            </jp-text-field>
            <jp-button id="browse-button" appearance="accent" onclick='handleBrowsePythonPath(this);' title="Browse for Python path on your computer"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 512"><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path d="M88.7 223.8L0 375.8V96C0 60.7 28.7 32 64 32H181.5c17 0 33.3 6.7 45.3 18.7l26.5 26.5c12 12 28.3 18.7 45.3 18.7H416c35.3 0 64 28.7 64 64v32H144c-22.8 0-43.8 12.1-55.3 31.8zm27.6 16.1C122.1 230 132.6 224 144 224H544c11.5 0 22 6.1 27.7 16.1s5.7 22.2-.1 32.1l-112 192C453.9 474 443.4 480 432 480H32c-11.5 0-22-6.1-27.7-16.1s-5.7-22.2 .1-32.1l112-192z"/></svg></jp-button>
          </div>
        </div>
        <div style="flex-grow: 1; overflow-x: hidden; overflow-y: auto;">
          <jp-menu id="env-list">
            <% envs.forEach(env => { %>
              <jp-menu-item data-python-path="<%- env.path %>" onclick="onMenuItemClicked(this);"><%- env.path %><div slot="end"><%- env.name %></div></jp-menu-item>
            <% }); %>
          </jp-menu>
        </div>
      </div>

      <script>
        const pythonPathInput = document.getElementById('python-path');
        const envListMenu = document.getElementById('env-list');
        const envs = <%- JSON.stringify(envs) %>;
        const numEnvs = envs.length;
        let activeIndex = -1;

        window.electronAPI.onCustomPythonPathSelected((path) => {
          pythonPathInput.value = path;
        });

        function onMenuItemClicked(el) {
          const pythonPath = el.dataset.pythonPath;
          window.electronAPI.setPythonPath(pythonPath);
        }

        function handleBrowsePythonPath(el) {
          window.electronAPI.browsePythonPath();
        }

        function updateActiveItem() {
          document.querySelectorAll('jp-menu-item').forEach((item) => {
            item.classList.remove('active');
          });

          const activeItem = envListMenu.children[activeIndex];
          activeItem.scrollIntoView();
          activeItem.classList.add('active');
          pythonPathInput.value = activeItem.dataset.pythonPath;
        }

        document.addEventListener("DOMContentLoaded", () => {
          pythonPathInput.control.onkeydown = (event) => {
            if (event.key === "Enter") {
              window.electronAPI.setPythonPath(pythonPathInput.value);
            } else if (event.key === "Escape") {
              window.electronAPI.closeEnvSelectPopup();
            } else if (event.key === "ArrowDown") {
              if (numEnvs == 0) {
                return;
              }
              if (activeIndex === -1) {
                activeIndex = 0;
              } else {
                activeIndex = (activeIndex + 1) % numEnvs;
              }
              updateActiveItem();
            } else if (event.key === "ArrowUp") {
              if (numEnvs == 0) {
                return;
              }
              if (activeIndex === -1) {
                activeIndex = numEnvs - 1;
              } else {
                activeIndex = (activeIndex - 1 + numEnvs) % numEnvs;
              }
              updateActiveItem();
            }
          };

          window.onkeydown = (event) => {
            if (event.key === "Escape") {
              window.electronAPI.closeEnvSelectPopup();
            }
          };

          pythonPathInput.control.focus();
        });

        window.addEventListener('load', () => {
          // shorten browser view height if larger than required
          setTimeout(() => {
            const totalHeight = pythonPathInput.getBoundingClientRect().height + envListMenu.getBoundingClientRect().height + 5 + 10 + 1;
            window.electronAPI.envSelectPopupHeightUpdated(totalHeight);
          }, 100);
        });
      </script>
        `;
    this._pageBody = ejs.render(template, {
      currentPythonPath,
      envs
    });
  }

  get view(): ThemedView {
    return this._view;
  }

  load() {
    this._view.loadViewContent(this._pageBody);
  }

  private _view: ThemedView;
  private _pageBody: string;
}

export namespace PythonEnvironmentSelectView {
  export interface IOptions {
    isDarkTheme: boolean;
    currentPythonPath: string;
    bundledPythonPath: string;
    envs: IPythonEnvironment[];
  }
}
