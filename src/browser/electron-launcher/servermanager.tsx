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

    private nextId: number = 1;

    constructor(props: ServerManager.Props) {
        super(props);

        this.addConnection = this.addConnection.bind(this);
        this.manageConnections = this.manageConnections.bind(this);
        this.connectionAdded = this.connectionAdded.bind(this);
        this.saveState = this.saveState.bind(this);
        this.renderServerManager = this.renderServerManager.bind(this);
        this.renderAddConnectionForm = this.renderAddConnectionForm.bind(this);

        this.state = {
            conns: {servers: [{id: String(this.nextId++), type: 'local', name: 'Local'}]},
            renderState: this.renderServerManager
        };
        this.managerState = new StateDB({namespace: SERVER_MANAGER_NAMESPACE});

        this.managerState.fetch(SERVER_DATA_ID)
            .then((data: ServerManager.Connections | null) => {
                if (data) {
                    this.setState({conns: data});
                    this.nextId = data.servers.length + 1;
                }
            })
            .catch((e) => {
                console.log(e);
            })
    }
    
    private saveState() {
        this.managerState.save(SERVER_DATA_ID, this.state.conns);
    }

    componentWillMount() {
        window.addEventListener('beforeunload', this.saveState);
    }

    componentWillUnmount() {
        this.saveState;
        window.removeEventListener('beforeunload', this.saveState);
    }

    private connectionAdded(server: ServerManager.Connection) {
        this.setState((prev: ServerManager.State) => {
            server.id = String(this.nextId++);
            let conns = this.state.conns.servers.concat(server);
            return({
                renderState: this.renderServerManager,
                conns: {servers: conns}
            });
        });
    }

    private addConnection() {
        this.setState({renderState: this.renderAddConnectionForm});
    }

    private manageConnections() {
        console.log('Manage connections');
    }

    private renderServerManager() {
        const cardProps = {
            serverSelected: this.props.serverSelected,
            servers: this.state.conns.servers,
            addConnection: this.addConnection
        };

        return (
            <div className='jpe-ServerManager-content'>
                <ServerManager.Header />
                <ServerManager.Cards {...cardProps}/>
                <ServerManager.Footer manageClicked={this.manageConnections}/>
            </div>
        )
    }

    private renderAddConnectionForm() {
        return (
            <div className='jpe-ServerManager-content'>
                <ServerManager.Header />
                <ServerManager.AddConnctionForm submit={this.connectionAdded}/>
            </div>
        );
    }

    render() {
        let content = this.state.renderState();

        return (
            <div className='jpe-ServerManager-body'>
                {content}
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
    interface State {
        conns: Connections;
        renderState: () => any;
    }
    
    export
    interface Connections extends JSONObject {
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
        type: 'remote' | 'local';

        /**
         * Name that appears in the html
         */
        name: string;

        /**
         * Server url
         */
        url?: string;

        token?: string;
    }

    /**
     * ServerManager header component.
     */
    export
    function Header() {
        return (
        <div className='jpe-ServerManager-header'>
            <div className='jpe-ServerManager-header-logo'></div>
            <h1 className='jpe-ServerManager-header-title'>Server Manager</h1>
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
                <Card addCard={true} key={newServer.id} 
                    server={newServer} onClick={this.props.addConnection}/>
            );

            return (
                <div className='jpe-ServerManager-card-container'>
                    <h2 className='jpe-ServerManager-card-header'>Start a new server</h2>
                    <div className='jpe-ServerManager-cards'>
                        {servers}
                    </div>
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
            addConnection: () => void;
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
        let cardClass: string = 'jpe-ServerManager-card';
        if (props.addCard)
            cardClass += ' jpe-mod-dashed';

        let iconClass : string = 'jpe-ServerManager-card-icon';
        let titleClass : string;
        if (props.addCard) {
            iconClass += ' jpe-ServerManager-card-new-icon';
            titleClass = 'jpe-ServerManager-card-title';
        } else if (props.server.type == 'remote'){
            iconClass += ' jpe-ServerManager-card-remote-icon';
        } else {
            iconClass += ' jpe-ServerManager-card-local-icon';
        }
        
        return (
            <div className={cardClass} onClick={() => {props.onClick(props.server)}}>
                <div className={iconClass}></div>
                <p className={titleClass}>{props.server.name}</p>
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

    export
    class AddConnctionForm extends React.Component<AddConnctionForm.Props, AddConnctionForm.State> {

        constructor(props: AddConnctionForm.Props) {
            super(props);
            this.state = {url: null, name: null, token: null};

            this.handleInputChange = this.handleInputChange.bind(this);
            this.handleSubmit = this.handleSubmit.bind(this);
        }

        handleSubmit(event: any) {
            event.preventDefault();
            if (!this.state.url || !this.state.name || !this.state.token) {
                return;
            }

            this.props.submit({
                id: null,
                type: 'remote',
                url: this.state.url,
                name: this.state.name,
                token: this.state.token
            });
        }

        handleInputChange(event: any) {
            const value = event.target.value;
            const name = event.target.name;

            this.setState({
                [name]: value
            });
        }

        render() {
            return (
                <div className='jpe-ServerManager-Add-container'>
                    <form className='jpe-ServerManager-Add-form' onSubmit={this.handleSubmit}>
                        <label>
                            URL:
                            <input type='text' name='url' placeholder='Enter URL' onChange={this.handleInputChange} required/>
                        </label>
                        <br />
                        <label>
                            Token:
                            <input type='text' name='token' placeholder='Enter Token' onChange={this.handleInputChange} required/>
                        </label>
                        <br />
                        <label>
                            Name:
                            <input type='text' name='name' placeholder='Enter Name' onChange={this.handleInputChange} required/>
                        </label>
                        <br />
                        <input type='submit' value='Connect' />
                    </form>
                </div>
            );
        }
    }

    export
    namespace AddConnctionForm {

        export
        interface Props {
            submit: (server: Connection) => void;
        }

        export
        interface State {
            url: string;
            name: string;
            token: string;
        }
    }

}