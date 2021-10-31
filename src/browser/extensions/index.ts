// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    PageConfig, URLExt
} from '@jupyterlab/coreutils';
import log from 'electron-log';

const extensions: any = {
    './electron-extension': require('./electron-extension'),
    './desktop-extension': require('./desktop-extension'),
    // turn off menu customization for now
    // './utils-extension': require('./utils-extension'),
    /**
     * Following extensions are defined under `extensions` in `package.json` and
     * are loaded eagerly by webpack module federation, which makes it possible
     * to share them with pre-built user extensions.
     *
     * For the user prebuilt extensions to work, in addition to the list below,
     * all core packages need to be listed with an appropriate version under
     * `resolutions` in `package.json`.
     */
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

function loadExtensions(extensions: { [key: string]: any }): any[] {
    const enabled: any[] = [];
    for (const extensionName of Object.keys(extensions)) {
        try {
            if (PageConfig.Extension.isDeferred(extensionName)) {
                deferred.matches.push(extensionName);
                ignored.push(extensionName);
            }
            if (PageConfig.Extension.isDisabled(extensionName)) {
                disabled.matches.push(extensionName);
            } else {
                const extension = extensions[extensionName];

                if (Array.isArray(extension)) {
                    extension.forEach(function (plugin) {
                        if (PageConfig.Extension.isDeferred(plugin.id)) {
                            deferred.matches.push(plugin.id);
                            ignored.push(plugin.id);
                        }
                        if (PageConfig.Extension.isDisabled(plugin.id)) {
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

/**
 * Iterate over active plugins in an extension.
 *
 * #### Notes
 * This also populates the disabled
 */
function* activePlugins(extension: any) {
    // Handle commonjs or es2015 modules
    let exports;
    if (Object.prototype.hasOwnProperty.call(extension, '__esModule')) {
        exports = extension.default;
    } else {
        // CommonJS exports.
        exports = extension;
    }

    let plugins = Array.isArray(exports) ? exports : [exports];
    for (let plugin of plugins) {
        if (PageConfig.Extension.isDisabled(plugin.id)) {
            disabled.matches.push(plugin.id);
            continue;
        }
        yield plugin;
    }
}

function loadScript(url: string) {
    return new Promise((resolve, reject) => {
        const newScript = document.createElement('script');
        newScript.onerror = reject;
        newScript.onload = resolve;
        newScript.async = true;
        document.head.appendChild(newScript);
        newScript.src = url;
    });
}

async function loadComponent(url: any, scope: any) {
    await loadScript(url);

    // From https://webpack.js.org/concepts/module-federation/#dynamic-remote-containers
    // eslint-disable-next-line no-undef
    // @ts-ignore
    await __webpack_init_sharing__('default');
    // @ts-ignore
    const container = window._JUPYTERLAB[scope];
    // Initialize the container, it may provide shared modules and may need ours
    // eslint-disable-next-line no-undef
    // @ts-ignore
    await container.init(__webpack_share_scopes__.default);
}

async function createModule(scope: any, module: any) {
    try {
        // @ts-ignore
        const factory = await window._JUPYTERLAB[scope].get(module);
        return factory();
    } catch (e) {
        console.warn(
            `Failed to create module: package: ${scope}; module: ${module}`
        );
        throw e;
    }
}

export async function main() {
    const jupyterlab = loadExtensions(extensions);
    const mime = loadExtensions(mimeExtensions);

    // based on https://github.com/jupyterlab/retrolab/blob/main/app/index.js

    await Promise.all(jupyterlab);
    await Promise.all(mime);

    const extension_data = JSON.parse(PageConfig.getOption('federated_extensions'));

    const federatedExtensionPromises: any[] = [];
    const federatedMimeExtensionPromises: any[] = [];
    const federatedStylePromises: any[] = [];

    let labExtensionUrl = PageConfig.getOption('fullLabextensionsUrl');
    const baseUrl = PageConfig.getOption('baseUrl');

    const allFederatedExtensions = await Promise.allSettled(
        extension_data.map(async (data: any) => {
            await loadComponent(
                URLExt.join(
                    baseUrl,
                    labExtensionUrl,
                    data.name,
                    data.load
                ),
                data.name
            );
            return data;
        })
    );

    // @ts-ignore
    allFederatedExtensions.forEach(p => {
        if (p.status === 'rejected') {
            // There was an error loading the component
            console.error(p.reason);
            return;
        }

        const data = p.value;
        if (data.extension) {
            federatedExtensionPromises.push(createModule(data.name, data.extension));
        }
        if (data.mimeExtension) {
            federatedMimeExtensionPromises.push(
                createModule(data.name, data.mimeExtension)
            );
        }
        if (data.style) {
            federatedStylePromises.push(createModule(data.name, data.style));
        }
    });


    // Add the federated extensions.
    const federatedExtensions = await Promise.allSettled(
        federatedExtensionPromises
    );
    federatedExtensions.forEach(p => {
        if (p.status === 'fulfilled') {
            for (let plugin of activePlugins(p.value)) {
                jupyterlab.push(plugin);
            }
        } else {
            console.error(p.reason);
        }
    });

    // Add the federated mime extensions.
    const federatedMimeExtensions = await Promise.allSettled(
        federatedMimeExtensionPromises
    );
    federatedMimeExtensions.forEach(p => {
        if (p.status === 'fulfilled') {
            for (let plugin of activePlugins(p.value)) {
                mime.push(plugin);
            }
        } else {
            console.error(p.reason);
        }
    });

    // Load all federated component styles and log errors for any that do not
    (await Promise.allSettled(federatedStylePromises))
        .filter(({ status }) => status === 'rejected')
        // @ts-ignore
        .forEach(({ reason }) => {
            console.error(reason);
        });

    return {
        jupyterlab,
        mime,
        disabled,
        deferred,
        ignored
    }
}
