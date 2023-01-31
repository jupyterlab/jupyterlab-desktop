// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { ipcMain } from 'electron';
import { EventTypeMain } from './eventtypes';
import { IDisposable } from './tokens';

export type AsyncEventHandlerMain = (
  event: Electron.IpcMainEvent,
  ...args: any[]
) => void;

export type SyncEventHandlerMain = (
  event: Electron.IpcMainEvent,
  ...args: any[]
) => any;

export class EventManager implements IDisposable {
  registerEventHandler(
    eventType: EventTypeMain,
    handler: AsyncEventHandlerMain
  ) {
    if (!this._asyncEventHandlers.has(eventType)) {
      this._asyncEventHandlers.set(eventType, []);
    }

    this._asyncEventHandlers.get(eventType).push(handler);
    ipcMain.on(eventType, handler);
  }

  registerSyncEventHandler(
    eventType: EventTypeMain,
    handler: SyncEventHandlerMain
  ) {
    if (!this._syncEventHandlers.has(eventType)) {
      this._syncEventHandlers.set(eventType, []);
    }

    this._syncEventHandlers.get(eventType).push(handler);
    ipcMain.handle(eventType, handler);
  }

  unregisterEventHandler(
    eventType: EventTypeMain,
    handler: AsyncEventHandlerMain
  ) {
    if (!this._asyncEventHandlers.has(eventType)) {
      return;
    }

    const handlers = this._asyncEventHandlers.get(eventType);
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      ipcMain.removeListener(eventType, handler);
      handlers.splice(index, 1);
    }
  }

  unregisterSyncEventHandler(
    eventType: EventTypeMain,
    handler: SyncEventHandlerMain
  ) {
    if (!this._syncEventHandlers.has(eventType)) {
      return;
    }

    const handlers = this._syncEventHandlers.get(eventType);
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      ipcMain.removeListener(eventType, handler);
      handlers.splice(index, 1);
    }
  }

  unregisterAllEventHandlers() {
    this._asyncEventHandlers.forEach(
      (handlers: AsyncEventHandlerMain[], eventType: EventTypeMain) => {
        for (const handler of handlers) {
          ipcMain.removeListener(eventType, handler);
        }
      }
    );

    this._asyncEventHandlers.clear();
  }

  unregisterAllSyncEventHandlers() {
    this._syncEventHandlers.forEach(
      (handlers: SyncEventHandlerMain[], eventType: EventTypeMain) => {
        for (const handler of handlers) {
          ipcMain.removeListener(eventType, handler);
        }
      }
    );

    this._syncEventHandlers.clear();
  }

  dispose(): Promise<void> {
    this.unregisterAllEventHandlers();
    this.unregisterAllSyncEventHandlers();

    return Promise.resolve();
  }

  private _asyncEventHandlers = new Map<
    EventTypeMain,
    AsyncEventHandlerMain[]
  >();
  private _syncEventHandlers = new Map<EventTypeMain, SyncEventHandlerMain[]>();
}
