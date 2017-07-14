// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONObject
} from '@phosphor/coreutils';

import {
    StateDB
} from '@jupyterlab/coreutils';

import * as React from 'react';


/**
 * Namspace for server manager state stored in StateDB
 */
const SERVER_MANAGER_NAMESPACE =  'ServerManager-state';

/**
 * ID for ServerManager server data in StateDB
 */
const SERVER_DATA_ID = 'servers';


/**
 * The main ServerManager component. This component
 * allows configuring multiple Jupyter connections.
 * 
 * @param props ServerManage properties 
 */
export
function ServerManager(props: ServerManager.Props) {
    return (
        <div className='jpe-ServerManager-body'>
            <div className='jpe-ServerManager-content'>
                <ServerManager.Header />
                <ServerManager.Cards {...props.cardProps}/>
                <ServerManager.Footer />
            </div>
        </div>
    );
}

/**
 * ServerManager child components and data.
 */
export
namespace ServerManager {

    /**
     * ServerManager higher level properties.
     */
    export
    interface Props {
        cardProps: Cards.Props;
    }

    /**
     * Server connection descriptor.
     */
    export
    interface Connection extends JSONObject {
        id: string;

        type: 'remote' | 'local' | 'new';

        name: string;
    }

    /**
     * ServerManager header component.
     */
    export
    function Header() {
        return (
        <div className='jpe-ServerManager-header'>
            <div className='jpe-ServerManager-header-logo'></div>
            <h1 className='jpe-ServerManager-header-title'>Welcome to JupyterLab</h1>
        </div>
        );
    }
    
    /**
     * ServerManager footer component.
     */
    export
    function Footer() {
        return (
            <div className='jpe-ServerManager-footer'>
                <p className='jpe-ServerManager-copyright'>Don't steal this</p>
            </div>
        );
    }

    /**
     * ServerManager card container. Contains configurable server descriptions.
     */
    export
    class Cards extends React.Component<Cards.Props, Cards.State> {

        private stateStore: StateDB;

        constructor(props: Cards.Props) {
            super(props);
            this.state = {servers: [{id: '1', type: 'local', name: 'Local'}]};
            this.stateStore = new StateDB({namespace: SERVER_MANAGER_NAMESPACE});

            this.stateStore.fetch(SERVER_DATA_ID)
                .then((data: Cards.State | null) => {
                    if (data)
                        this.setState(data);
                })
                .catch((e) => {
                    console.log(e);
                })
            
            this.addNewConnection = this.addNewConnection.bind(this);
        }

        private addNewConnection() {
            console.log('Adding a new connection');
        }

        render() {
            const servers = this.state.servers.map((server) => 
                <Card key={server.id} server={server} onClick={(server: Connection) => {
                        this.props.serverSelected(server)
                    }}/>
            )

            // Add the 'new connection' card
            const newServer: Connection = {id: 'new', type: 'new', name: 'New'}
            servers.push(
                <Card key={newServer.id} server={newServer} onClick={this.addNewConnection}/>
            );

            return (
                <div className='jpe-ServerManager-cards'>
                    {servers}
                </div>
            );
        }
    }

    /**
     * Cards component data.
     */
    export
    namespace Cards {

        /**
         * Cards component properties.
         */
        export
        interface Props {
            serverSelected: (server: ServerManager.Connection) => void;
        }

        /**
         * Cards component state.
         */
        export
        interface State extends JSONObject{
            servers: ServerManager.Connection[];
        }
    }

    /**
     * Card component. Displays server data.
     * 
     * @param props Card properties.
     */
    function Card(props: Card.Props) {
        let className: string = 'jpe-ServerManager-card';
        if (this.props.server.type == 'new')
            className += ' jpe-mod-dashed';

        return (
            <div className={className} onClick={() => {this.props.onClick(this.props.server)}}>
                <div className="jpe-ServerManager-card-content"></div>
                <p>{this.props.server.name}</p>
            </div>
        )
    }

    /**
     * Card component data.
     */
    namespace Card {
        export
        interface Props {
            server: Connection;
            onClick: (server: Connection) => void;
        }
    }

}