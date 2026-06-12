import { contextBridge, ipcRenderer } from 'electron';
import { vi } from 'vitest';

export { ipcRenderer };

// The API object the preload handed to contextBridge.exposeInMainWorld('electronAPI', ...).
export function exposedAPI(): Record<string, any> {
  const call = vi
    .mocked(contextBridge.exposeInMainWorld)
    .mock.calls.find(c => c[0] === 'electronAPI');
  if (!call) {
    throw new Error('preload did not expose an "electronAPI" namespace');
  }
  return call[1] as Record<string, any>;
}

// The handler the preload registered for a given EventTypeRenderer channel via
// ipcRenderer.on at module load. Invoke it to simulate a message from main.
export function rendererHandler(channel: string): (...args: any[]) => void {
  const call = vi.mocked(ipcRenderer.on).mock.calls.find(c => c[0] === channel);
  if (!call) {
    throw new Error(`no ipcRenderer.on listener registered for "${channel}"`);
  }
  return call[1] as (...args: any[]) => void;
}
