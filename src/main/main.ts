import {app} from 'electron'

import * as Bottle from 'bottlejs';

/**
 * Require debugging tools. Only
 * runs when in development.
 */
require('electron-debug')({showDevTools: false});

let services: IService[] = [
    require('./app').default,
    require('./sessions').default
];

export
interface IService {
    requirements: String[];
    provides: string,
    activate: (...any: any[]) => any,
    autostart?: boolean
}

function main(): void {
    let serviceManager = new Bottle();
    services.forEach((s: IService) => {
        serviceManager.factory(s.provides, (container: any) => {
            let args = s.requirements.map((r: string) => {
                return container[r]
            });
            return s.activate(...args);
        });
        if (s.autostart)
            serviceManager.digest([s.provides]);
    });
}

app.on('ready', () => {
    main();
});

