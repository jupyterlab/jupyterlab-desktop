const template = document.createElement('template');
template.innerHTML = `
  <style>
    .container {
      display: flex;
      gap: 5px;
      width: fit-content;
      padding: 2px;
      background: var(--neutral-layer-2);
      cursor: pointer;
    }
    .container:hover, .container:hover svg {
      color: var(--neutral-foreground-hint);
      fill: var(--neutral-foreground-hint);
    }
    .container:active, .container:active svg {
      color: var(--accent-foreground-active);
      fill: var(--accent-foreground-active);
    }
    .copy-icon svg {
      fill: var(--neutral-foreground-rest);
      width: 16px;
      height: 16px;
    }
  </style>
  <div style="display: inline-block;">
    <div class="container" data-copied="" title="Copy to clipboard">
        <div class="label"></div><div class="copy-icon"><svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512"><!--! Font Awesome Free 6.4.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path d="M384 336H192c-8.8 0-16-7.2-16-16V64c0-8.8 7.2-16 16-16l140.1 0L400 115.9V320c0 8.8-7.2 16-16 16zM192 384H384c35.3 0 64-28.7 64-64V115.9c0-12.7-5.1-24.9-14.1-33.9L366.1 14.1c-9-9-21.2-14.1-33.9-14.1H192c-35.3 0-64 28.7-64 64V320c0 35.3 28.7 64 64 64zM64 128c-35.3 0-64 28.7-64 64V448c0 35.3 28.7 64 64 64H256c35.3 0 64-28.7 64-64V416H272v32c0 8.8-7.2 16-16 16H64c-8.8 0-16-7.2-16-16V192c0-8.8 7.2-16 16-16H96V128H64z"/></svg></div>
    </div>
  </div>
`;

class CopyableSpan extends HTMLElement {
  constructor() {
    super();

    this.attachShadow({ mode: 'open' });

    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.shadowRoot.querySelector('.container').onclick = evt => {
      window.electronAPI.copyToClipboard(evt.currentTarget.dataset.copied);
    };
  }

  static get observedAttributes() {
    return ['label', 'title', 'copied'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case 'label':
        this.shadowRoot.querySelector('.label').innerText = decodeURIComponent(
          newValue
        );
        break;
      case 'title':
        this.shadowRoot.querySelector('.container').title = decodeURIComponent(
          newValue
        );
        break;
      case 'copied':
        this.shadowRoot.querySelector(
          '.container'
        ).dataset.copied = decodeURIComponent(newValue);
        break;
    }
  }
}

window.customElements.define('copyable-span', CopyableSpan);
