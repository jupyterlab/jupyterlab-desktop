
let jupyterlab = [
    require("./extensions/electron-extension"),
    require("./extensions/utils-extension"),
    require("@jupyterlab/chatbox-extension"),
    require("@jupyterlab/codemirror-extension"),
    require("@jupyterlab/completer-extension"),
    require("@jupyterlab/console-extension"),
    require("@jupyterlab/csvviewer-extension"),
    require("@jupyterlab/docmanager-extension"),
    require("@jupyterlab/fileeditor-extension"),
    require("@jupyterlab/faq-extension"),
    require("@jupyterlab/filebrowser-extension"),
    require("@jupyterlab/help-extension"),
    require("@jupyterlab/imageviewer-extension"),
    require("@jupyterlab/inspector-extension"),
    require("@jupyterlab/launcher-extension"),
    require("@jupyterlab/markdownviewer-extension"),
    require("@jupyterlab/notebook-extension"),
    require("@jupyterlab/running-extension"),
    require("@jupyterlab/services-extension"),
    require("@jupyterlab/settingeditor-extension"),
    require("@jupyterlab/shortcuts-extension"),
    require("@jupyterlab/tabmanager-extension"),
    require("@jupyterlab/terminal-extension"),
    require("@jupyterlab/theme-light-extension"),
    require("@jupyterlab/tooltip-extension")
];

let mime = [
    require("@jupyterlab/vega2-extension")
];

export default {jupyterlab, mime};
