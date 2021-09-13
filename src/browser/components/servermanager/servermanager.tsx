// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JupyterServer
} from '../../utils';

import * as React from 'react';
import log from 'electron-log';



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
        this.serverAdded = this.serverAdded.bind(this);
        this.addFormCancel = this.addFormCancel.bind(this);
    }

    private addFormCancel() {
        log.log('Cancel');
    }

    private serverAdded(server: JupyterServer.IServer) {
        this.props.serverAdded(server);
    }

    render() {
        return (
            <div className='jpe-ServerManager-body'>
                <div className='jpe-ServerManager-content'>
                    <ServerManager.Header />
                    <ServerManager.AddConnctionForm cancel={this.addFormCancel} submit={this.serverAdded}/>
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
        serverAdded: (server: JupyterServer.IServer) => void;
    }

    /**
     * ServerManager component state.
     */
    export
    interface State {
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
            } as any);
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
                        <input className='jpe-ServerManager-input' type='text' name='token' placeholder='Enter server token' onChange={this.handleInputChange} required/>
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
            submit: (server: JupyterServer.IServer) => void;
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