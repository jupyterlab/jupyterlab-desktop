// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

class JupyterLabDialogTitleBar extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({ mode: 'open' });

    const wrapper = document.createElement('div');
    wrapper.setAttribute('class', 'titlebar');

    const titleEl = document.createElement('div');
    titleEl.setAttribute('class', 'dialog-title');

    const closeButton = document.createElement('div');
    closeButton.setAttribute('class', 'close-button');
    closeButton.innerText = 'X';
    closeButton.onclick = () => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      window.electronAPI?.closeWindow();
    };

    const title = this.getAttribute('data-title');
    titleEl.textContent = title;

    const style = document.createElement('style');

    style.textContent = `
      .titlebar {
        height: 28px;
        line-height: 28px;
        display: flex;
        flex-direction: row;
        padding: 0 10px;
        background-color: #e1e1e1;
        color: #000000;
        -webkit-user-select: none;
        user-select: none;
        -webkit-app-region: drag;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica,
          Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji',
          'Segoe UI Symbol';
        font-size: 13px;
      }

      .titlebar.app-ui-dark {
        background-color: #424242;
        color: #ffffff;
      }

      .dialog-title {
        flex-grow: 1;
        float: left;
      }

      .close-button {
        -webkit-app-region: no-drag;
        font-weight: bold;
        color: #5a5a5a;
        padding: 0 5px;
      }
      .app-ui-dark .close-button {
        color: #bdbdbd;
      }

      .close-button:hover {
        background-color: #c1c1c1;
      }
      .app-ui-dark .close-button:hover {
        background-color: #505050;
      }
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    window.electronAPI?.isDarkTheme().then(dark => {
      if (dark) {
        wrapper.classList.add('app-ui-dark');
      }
    });
    wrapper.appendChild(titleEl);
    wrapper.appendChild(closeButton);
  }
}

customElements.define('jlab-dialog-titlebar', JupyterLabDialogTitleBar);
