// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

// close button SVG from https://github.com/AlexTorresSk/custom-electron-titlebar

class JupyterLabDialogTitleBar extends HTMLElement {
  constructor() {
    super();

    const shadow = this.attachShadow({ mode: 'open' });

    const wrapper = document.createElement('div');
    wrapper.setAttribute('class', 'titlebar');

    const titleEl = document.createElement('div');
    titleEl.setAttribute('class', 'dialog-title');

    const closable = this.getAttribute('data-closable') !== 'false';
    let closeButton = null;
    if (closable) {
      closeButton = document.createElement('div');
      closeButton.setAttribute('class', 'close-button');
      closeButton.innerHTML = `<svg viewBox='0 0 10 10'><polygon points='10.2,0.7 9.5,0 5.1,4.4 0.7,0 0,0.7 4.4,5.1 0,9.5 0.7,10.2 5.1,5.8 9.5,10.2 10.2,9.5 5.8,5.1'/></svg>`;
      closeButton.title = 'Close';
      closeButton.onclick = () => {
        window.close();
      };
    }

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

      :host(.app-ui-dark) .titlebar {
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
      :host(.app-ui-dark) .close-button {
        color: #bdbdbd;
      }

      .close-button:hover {
        background-color: #c1c1c1;
      }
      :host(.app-ui-dark) .close-button:hover {
        background-color: #505050;
      }
      
      .close-button svg {
        width: 12px;
        height: 12px;
        padding-top: 8px;
        fill: var(--neutral-foreground-rest);
      }
    `;

    shadow.appendChild(style);
    shadow.appendChild(wrapper);
    wrapper.appendChild(titleEl);
    if (closeButton) {
      wrapper.appendChild(closeButton);
    }
  }
}

customElements.define('jlab-dialog-titlebar', JupyterLabDialogTitleBar);
