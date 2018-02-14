// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

let jupyterlab = [
    require('./electron-extension'),
    require('./utils-extension'),
    require('@jupyterlab/codemirror-extension'),
    require('@jupyterlab/completer-extension'),
    require('@jupyterlab/console-extension'),
    require('@jupyterlab/csvviewer-extension'),
    require('@jupyterlab/docmanager-extension'),
    require('@jupyterlab/faq-extension'),
    require('@jupyterlab/filebrowser-extension'),
    require('@jupyterlab/fileeditor-extension'),
    require('@jupyterlab/help-extension'),
    require('@jupyterlab/imageviewer-extension'),
    require('@jupyterlab/inspector-extension'),
    require('@jupyterlab/launcher-extension'),
    require('@jupyterlab/mainmenu-extension'),
    require('@jupyterlab/markdownviewer-extension'),
    require('@jupyterlab/mathjax2-extension'),
    require('@jupyterlab/notebook-extension'),
    require('@jupyterlab/rendermime-extension'),
    require('@jupyterlab/running-extension'),
    require('@jupyterlab/settingeditor-extension'),
    require('@jupyterlab/shortcuts-extension'),
    require('@jupyterlab/tabmanager-extension'),
    require('@jupyterlab/terminal-extension'),
    require('@jupyterlab/theme-dark-extension'),
    require('@jupyterlab/theme-light-extension'),
    require('@jupyterlab/tooltip-extension')
];

let mime = [
    require('@jupyterlab/json-extension'),
    require('@jupyterlab/pdf-extension'),
    require('@jupyterlab/vdom-extension'),
    require('@jupyterlab/vega2-extension')
];

export default {jupyterlab, mime};
