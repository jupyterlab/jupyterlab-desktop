// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import * as React from 'react';

export namespace SplashScreen {
    export
    interface Props {
        finished: () => void;
    }

    export
    interface State {
        fadeSplash: boolean;
    }
}

export
class SplashScreen extends React.Component<SplashScreen.Props, SplashScreen.State> {

    private fadeSplash: boolean = false;

    constructor(props: SplashScreen.Props) {
        super(props);
        this.state = {fadeSplash: false};
        this.finishIteration = this.finishIteration.bind(this);
    }

    private finishIteration() {
        if (this.state.fadeSplash)
            this.props.finished();

        if (this.fadeSplash)
            this.setState({fadeSplash: true});
    }
    
    fadeSplashScreen() {
        this.fadeSplash = true;
    }
    
    render() {
        const style = {
            animation: (this.state.fadeSplash ? 'fade .4s linear 0s forwards' : '')
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