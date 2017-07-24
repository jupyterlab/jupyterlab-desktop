// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JupyterServerIPC as ServerIPC
} from '../../ipc';

import * as React from 'react';


/**
 * The main ServerManager component. This component
 * allows configuring multiple Jupyter connections.
 * 
 * @param props ServerManager properties 
 */
export
class ServerManager extends React.Component<ServerManager.Props, ServerManager.State> {
    
    constructor(props: ServerManager.Props) {
        super(props);
        this.addConnection = this.addConnection.bind(this);
        this.manageConnections = this.manageConnections.bind(this);
        this.renderServerManager = this.renderServerManager.bind(this);
        this.renderAddConnectionForm = this.renderAddConnectionForm.bind(this);
        this.addFormCancel = this.addFormCancel.bind(this);
        
        this.state = {renderState: this.renderAddConnectionForm};
    }
    
    private addFormCancel() {
        this.setState({renderState: this.renderServerManager});
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
            servers: this.props.servers,
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
                <ServerManager.AddConnctionForm cancel={this.addFormCancel} submit={this.props.serverAdded}/>
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
        serverSelected: (server: ServerIPC.ServerDesc) => void;
        serverAdded: (server: ServerIPC.ServerDesc) => void;
        servers: ServerIPC.ServerDesc[];
    }

    /**
     * ServerManager component state.
     */
    export
    interface State {
        renderState: () => any;
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
                    MANAGE CONNECTIONS
                </button>
                <p className='jpe-ServerManager-copyright'>	&copy; Project Jupyter 2017</p>
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
            let servers = this.props.servers.map((server) => 
                <Card key={server.id} server={server} onClick={(server: ServerIPC.ServerDesc) => {
                        this.props.serverSelected(server)
                    }}/>
            )

            // Add the 'new connection' card
            const newServer: ServerIPC.ServerDesc = {id: null, type: null, name: 'New'}
            servers.push(
                <Card addNewCard={true} key={newServer.id} 
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
            serverSelected: (server: ServerIPC.ServerDesc) => void;
            servers: ServerIPC.ServerDesc[];
        }
    }

    /**
     * Card component. Displays server data.
     * 
     * @param props Card properties.
     */
    function Card(props: Card.Props) {
        let cardClass: string = 'jpe-ServerManager-card';
        if (props.addNewCard)
            cardClass += ' jpe-mod-dashed';

        let iconClass : string = 'jpe-ServerManager-card-icon';
        let titleClass : string;
        if (props.addNewCard) {
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
            server: ServerIPC.ServerDesc;
            addNewCard?: boolean;
            onClick: (server: ServerIPC.ServerDesc) => void;
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
                    <form className='jpe-ServerManager-Add-card' onSubmit={this.handleSubmit}>
                        <h2 className='jpe-ServerManager-Add-card-header'>Add a new server</h2>
                        <input className='jpe-ServerManager-input' type='text' name='name' placeholder='Enter server name' onChange={this.handleInputChange} required/>
                        <br />
                        <input className='jpe-ServerManager-input' type='text' name='url' placeholder='Enter server URL' onChange={this.handleInputChange} required/>
                        <br />
                        <div className='jpe-ServerManager-Add-footer'>
                            <input className='jpe-ServerManager-Add-cancel-btn' type='button' value='CANCEL' onClick={this.props.cancel} />
                            <input className='jpe-ServerManager-Add-connect-btn' type='submit' value='CONNECT' name='submit' />
                        </div>
                    </form>
                    <div className='jpe-ServerManager-footer'>
                        <p className='jpe-ServerManager-copyright'>	&copy; Project Jupyter 2017</p>
                    </div>
                </div>
            );
        }
    }

    export
    namespace AddConnctionForm {

        export
        interface Props {
            submit: (server: ServerIPC.ServerDesc) => void;
            cancel: () => void;
        }

        export
        interface State {
            url: string;
            name: string;
            token: string;
        }
    }

}