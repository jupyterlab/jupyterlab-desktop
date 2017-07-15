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
class ServerManager extends React.Component<ServerManager.Props, ServerManager.State> {
    
    private managerState: StateDB;

    constructor(props: ServerManager.Props) {
        super(props);
        this.state = {servers: [{id: '1', type: 'local', name: 'Local'}]};
        this.managerState = new StateDB({namespace: SERVER_MANAGER_NAMESPACE});

        this.managerState.fetch(SERVER_DATA_ID)
            .then((data: ServerManager.State | null) => {
                if (data)
                    this.setState(data);
            })
            .catch((e) => {
                console.log(e);
            })
    }

    private manageConnections() {
        console.log('Manage connections');
    }

    render() {
        return (
            <div className='jpe-ServerManager-body'>
                <div className='jpe-ServerManager-content'>
                    <ServerManager.Header />
                    <ServerManager.Cards serverSelected={this.props.serverSelected} servers={this.state.servers}/>
                    <ServerManager.Footer manageClicked={this.manageConnections}/>
                </div>
            </div>
        );
    }
}

/**
 * ServerManager child components and data.
 */
export
namespace ServerManager {

    /**
     * ServerManager component properties.
     */
    export
    interface Props {
        serverSelected: (server: Connection) => void;
    }

    /**
     * ServerManager component state.
     */
    export
    interface State extends JSONObject{
        servers: Connection[];
    }

    /**
     * Server connection descriptor.
     */
    export
    interface Connection extends JSONObject {
        /**
         * Server ID. Should be unique to each server.
         */
        id: string;

        /**
         * The tyoe of server
         */
        type: 'remote' | 'local' | null;

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
    function Footer(props: Footer.Props) {
        return (
            <div className='jpe-ServerManager-footer'>
                <button className='jpe-ServerManager-manage-btn' onClick={props.manageClicked}>
                    Manage Connections
                </button>
                <p className='jpe-ServerManager-copyright'>Don't steal this</p>
            </div>
        );
    }

    /**
     * Footer component data.
     */
    export
    namespace Footer {

        /**
         * Footer component properties.
         */
        export
        interface Props {
            manageClicked: () => void
        }

    }

    /**
     * ServerManager card container. Contains configurable server descriptions.
     */
    export
    class Cards extends React.Component<Cards.Props, undefined> {

        constructor(props: Cards.Props) {
            super(props);
            this.addNewConnection = this.addNewConnection.bind(this);
        }

        private addNewConnection() {
            console.log('Adding a new connection');
        }

        render() {
            const servers = this.props.servers.map((server) => 
                <Card key={server.id} server={server} onClick={(server: Connection) => {
                        this.props.serverSelected(server)
                    }}/>
            )

            // Add the 'new connection' card
            const newServer: Connection = {id: 'new', type: null, name: 'New'}
            servers.push(
                <Card addCard={true} key={newServer.id} server={newServer} onClick={this.addNewConnection}/>
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
        if (props.addCard)
            className += ' jpe-mod-dashed';

        return (
            <div className={className} onClick={() => {props.onClick(props.server)}}>
                <div className="jpe-ServerManager-card-content"></div>
                <p>{props.server.name}</p>
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
            addCard?: boolean;
            onClick: (server: Connection) => void;
        }
    }

}