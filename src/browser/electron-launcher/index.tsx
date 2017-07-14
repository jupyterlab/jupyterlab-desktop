// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

import './style/index.css';

export
class ElectronLauncher extends React.Component {
  render() {
    return <h1>Welcome to the Launcehr</h1>;
  }
}

export
interface SplashScreenProps {
    iterationDone: () => boolean;
    splashComplete: () => void;
}

export
interface SplashScreenState {
    runAgain: boolean;
}

export
class SplashScreen extends React.Component<SplashScreenProps, SplashScreenState> {

    constructor(props: SplashScreenProps) {
        super(props);
        this.state = {runAgain: true};
        this.finishIteration = this.finishIteration.bind(this);
    }

    private finishIteration() {
        if (!this.state.runAgain) {
            this.props.splashComplete();
            return;
        }

        this.setState({runAgain: this.props.iterationDone()});
    }
        
    render() {
        const style = {
            animation: (!this.state.runAgain ? 'fade .4s linear 0s forwards' : '')
        };

        return (
            <div id="universe" style={style}>
                <div id="galaxy">
                <div id="main-logo">
                </div>
                    <div id="moon1" className="moon orbit" onAnimationIteration={this.finishIteration}>
                        <div className="planet"></div>
                    </div>
                    <div id="moon2" className="moon orbit">
                        <div className="planet"></div>
                    </div>
                    <div id="moon3" className="moon orbit">
                        <div className="planet"></div>
                    </div>
                </div>
            </div>
        );
    }
}