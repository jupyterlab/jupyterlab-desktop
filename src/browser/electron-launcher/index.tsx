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
        let runAgain: boolean;

        if (this.props.iterationDone)
            runAgain = this.props.iterationDone();
        this.setState({runAgain: runAgain});
    }
        
    render() {
        if (!this.state.runAgain)
            return null;

        return (
            <div id="universe">
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