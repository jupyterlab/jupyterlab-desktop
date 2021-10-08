// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    PageConfig
} from '@jupyterlab/coreutils';
import log from 'electron-log';

const extensions: any = {
    './electron-extension': require('./electron-extension'),
    './desktop-extension': require('./desktop-extension'),
    // turn off menu customization for now
    // './utils-extension': require('./utils-extension'),
    '@jupyterlab/apputils-extension': require('@jupyterlab/apputils-extension'),
    '@jupyterlab/celltags-extension': require('@jupyterlab/celltags-extension'),
    '@jupyterlab/codemirror-extension': require('@jupyterlab/codemirror-extension'),
    '@jupyterlab/completer-extension': require('@jupyterlab/completer-extension'),
    '@jupyterlab/console-extension': require('@jupyterlab/console-extension'),
    '@jupyterlab/csvviewer-extension': require('@jupyterlab/csvviewer-extension'),
    '@jupyterlab/debugger-extension': require('@jupyterlab/debugger-extension'),
    '@jupyterlab/docmanager-extension': require('@jupyterlab/docmanager-extension'),
    '@jupyterlab/docprovider-extension': require('@jupyterlab/docprovider-extension'),
    '@jupyterlab/documentsearch-extension': require('@jupyterlab/documentsearch-extension'),
    '@jupyterlab/filebrowser-extension': require('@jupyterlab/filebrowser-extension'),
    '@jupyterlab/fileeditor-extension': require('@jupyterlab/fileeditor-extension'),
    '@jupyterlab/help-extension': require('@jupyterlab/help-extension'),
    '@jupyterlab/htmlviewer-extension': require('@jupyterlab/htmlviewer-extension'),
    '@jupyterlab/imageviewer-extension': require('@jupyterlab/imageviewer-extension'),
    '@jupyterlab/inspector-extension': require('@jupyterlab/inspector-extension'),
    '@jupyterlab/launcher-extension': require('@jupyterlab/launcher-extension'),
    '@jupyterlab/logconsole-extension': require('@jupyterlab/logconsole-extension'),
    '@jupyterlab/mainmenu-extension': require('@jupyterlab/mainmenu-extension'),
    '@jupyterlab/markdownviewer-extension': require('@jupyterlab/markdownviewer-extension'),
    '@jupyterlab/mathjax2-extension': require('@jupyterlab/mathjax2-extension'),
    '@jupyterlab/notebook-extension': require('@jupyterlab/notebook-extension'),
    '@jupyterlab/rendermime-extension': require('@jupyterlab/rendermime-extension'),
    '@jupyterlab/running-extension': require('@jupyterlab/running-extension'),
    '@jupyterlab/settingeditor-extension': require('@jupyterlab/settingeditor-extension'),
    '@jupyterlab/shortcuts-extension': require('@jupyterlab/shortcuts-extension'),
    '@jupyterlab/statusbar-extension': require('@jupyterlab/statusbar-extension'),
    '@jupyterlab/terminal-extension': require('@jupyterlab/terminal-extension'),
    '@jupyterlab/theme-dark-extension': require('@jupyterlab/theme-dark-extension'),
    '@jupyterlab/theme-light-extension': require('@jupyterlab/theme-light-extension'),
    '@jupyterlab/toc-extension': require('@jupyterlab/toc-extension'),
    '@jupyterlab/tooltip-extension': require('@jupyterlab/tooltip-extension'),
    '@jupyterlab/translation-extension': require('@jupyterlab/translation-extension'),
    '@jupyterlab/ui-components-extension': require('@jupyterlab/ui-components-extension'),
    '@jupyterlab/vdom-extension': require('@jupyterlab/vdom-extension'),
    // ipywidgets support
    '@jupyter-widgets/jupyterlab-manager': require('@jupyter-widgets/jupyterlab-manager'),
} as { [key: string]: any };

const mimeExtensions: any = {
    '@jupyterlab/javascript-extension': require('@jupyterlab/javascript-extension'),
    '@jupyterlab/json-extension': require('@jupyterlab/json-extension'),
    '@jupyterlab/pdf-extension': require('@jupyterlab/pdf-extension'),
    '@jupyterlab/vega5-extension': require('@jupyterlab/vega5-extension'),
} as { [key: string]: any };

const disabled = { patterns: [] as string[], matches: [] as string[] };
const deferred = { patterns: [] as string[], matches: [] as string[] };
const ignored: string[] = [];

// Get the disabled extensions.
let disabledExtensions: IExtensionPattern[] = [];
try {
    const tempDisabled = PageConfig.getOption('disabledExtensions');
    if (tempDisabled) {
        disabledExtensions = JSON.parse(tempDisabled).map(function (pattern: string) {
            disabled.patterns.push(pattern);
            return { raw: pattern, rule: new RegExp(pattern) };
        });
    }
} catch (error) {
    log.warn('Unable to parse disabled extensions.', error);
}

// Get the deferred extensions.
let deferredExtensions: IExtensionPattern[] = [];
try {
    const tempDeferred = PageConfig.getOption('deferredExtensions');
    if (tempDeferred) {
        deferredExtensions = JSON.parse(tempDeferred).map(function (pattern: string) {
            deferred.patterns.push(pattern);
            return { raw: pattern, rule: new RegExp(pattern) };
        });
    }
} catch (error) {
    log.warn('Unable to parse deferred extensions.', error);
}

function isDeferred(value: string) {
    return deferredExtensions.some(function (pattern) {
        return pattern.raw === value || pattern.rule.test(value);
    });
}

function isDisabled(value: string) {
    return disabledExtensions.some(function (pattern) {
        return pattern.raw === value || pattern.rule.test(value);
    });
}

function loadExtensions(extensions: { [key: string]: any }): any[] {
    const enabled: any[] = [];
    for (const extensionName of Object.keys(extensions)) {
        try {
            if (isDeferred(extensionName)) {
                deferred.matches.push(extensionName);
                ignored.push(extensionName);
            }
            if (isDisabled(extensionName)) {
                disabled.matches.push(extensionName);
            } else {
                const extension = extensions[extensionName];

                if (Array.isArray(extension)) {
                    extension.forEach(function (plugin) {
                        if (isDeferred(plugin.id)) {
                            deferred.matches.push(plugin.id);
                            ignored.push(plugin.id);
                        }
                        if (isDisabled(plugin.id)) {
                            disabled.matches.push(plugin.id);
                            return;
                        }
                        enabled.push(plugin);
                    });
                } else {
                    enabled.push(extension);
                }
            }
        } catch (e) {
            log.error(e);
        }
    }
    return enabled;
}

const jupyterlab = loadExtensions(extensions);
const mime = loadExtensions(mimeExtensions);

export default { jupyterlab, mime, disabled, deferred, ignored };

interface IExtensionPattern {
    raw: string;
    rule: RegExp;
}
