// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { VDomModel, VDomRenderer } from '@jupyterlab/apputils';
import React from 'react';
import { GroupItem, interactiveItem, TextItem } from '@jupyterlab/statusbar';
import {
 pythonIcon
} from '@jupyterlab/ui-components';

/**
 * A pure functional component for rendering environment status.
 */
function EnvironmentStatusComponent(
  props: EnvironmentStatusComponent.IProps
): React.ReactElement<EnvironmentStatusComponent.IProps> {
  return (
    <GroupItem onClick={props.handleClick} spacing={2} title={props.description}>
      <pythonIcon.react title={''} top={'2px'} stylesheet={'statusBar'} />
      <TextItem source={props.name} />
    </GroupItem>
  );
}

/**
 * A namespace for EnvironmentStatusComponent statics.
 */
namespace EnvironmentStatusComponent {
  /**
   * Props for the environment status component.
   */
  export interface IProps {
    /**
     * A click handler for the environment status component. By default
     * we have it bring up the environment change dialog.
     */
    handleClick: () => void;

    /**
     * The name the environment.
     */
    name: string;

    /**
     * The description of the environment.
     */
    description: string;
  }
}

/**
 * A VDomRenderer widget for displaying the environment.
 */
export class EnvironmentStatus extends VDomRenderer<EnvironmentStatus.Model> {
  /**
   * Construct the environment status widget.
   */
  constructor(opts: EnvironmentStatus.IOptions) {
    super(new EnvironmentStatus.Model());
    this.model.name = opts.name;
    this.model.description = opts.description;
    this._handleClick = opts.onClick;
    this.addClass(interactiveItem);
  }

  /**
   * Render the environment status item.
   */
  render() {
    if (this.model === null) {
      return null;
    } else {
      return (
        <EnvironmentStatusComponent
          name={this.model.name}
          description={this.model.description}
          handleClick={this._handleClick}
        />
      );
    }
  }

  private _handleClick: () => void;
}

/**
 * A namespace for EnvironmentStatus statics.
 */
export namespace EnvironmentStatus {
  export class Model extends VDomModel {
    constructor() {
      super();

      this._name = 'env';
      this._description = '';
    }

    get name() {
      return this._name;
    }

    set name(val: string) {
      const oldVal = this._name;
      if (oldVal === val) {
        return;
      }
      this._name = val;
      this.stateChanged.emit(void 0);
    }

    get description(): string {
      return this._description;
    }
    set description(val: string) {
      const oldVal = this._description;
      if (oldVal === val) {
        return;
      }
      this._description = val;
      this.stateChanged.emit(void 0);
    }

    private _name: string;
    private _description: string;
  }

  /**
   * Options for creating a EnvironmentStatus object.
   */
  export interface IOptions {
    /**
     * Environment name
     */
    name: string;
    /**
     * Environment description
     */
    description: string;
    /**
     * A click handler for the item. By default
     * we launch an environment selection dialog.
     */
    onClick: () => void;
  }
}
