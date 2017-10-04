# AsyncRemote

The `AsyncRemote` module provides a simple, promise-based, type-safe mechanism for
inter-process communication. This is done using two abstractions,
methods and events, the key difference being that methods are initiated by
the renderer process, and events are intiated by the main process.

## AsyncRemote Methods
`asyncRemote` methods are main process functions that are exposed to
renderer process. When the render process requests execution of an 
exposed main-process function, it recieves a promise that is resolved
when execution completes. An example exposing a method to the
render process:

### Main Process
```typescript
import {AsyncRemote, asyncRemoteMain} from 'asyncremote';

// Create an IMethod object to describe a method with a 'number' as
// an argument and a 'string' as the return type.
let makeString = AsyncRemote.IMethod<number, string> = {
    id: 'makestring'
}

// Register the method with the api, passing in the function to execute.
// The function will be required to have the correct type.
asyncRemoteMain.registerRemoteMethod(makeString, (x: number) => {
    return 'Your number is: ' + x;
});

```

### Renderer Process
```typescript
import {asyncRemoteRenderer} from 'asyncremote';
import {makeString} from './path/to/makeString/file';

asyncRemoteRenderer.runRemoteMethod(makeString, 42)
    .then((result: string) => {
        console.log(result) // Logs 'Your number is: 42'
    })
    .catch((err) => {
        console.error('Remote method execution failed');
        console.error(err);
    });
```

## AsyncRemote Events
`asyncRemote` events can be emitted to any number of listening
renderer processes. The are initiated by the main process
instead of the renderer process. An example of emitting a remote event:

### Main Process
```typescript
import {AsyncRemote, asyncRemoteMain} from 'asyncremote';

// Create an IEvent object to describe a event with a 'string'
// being emitted.
let myEvent = AsyncRemote.IEvent<string> = {
    id: 'myevent'
}

// Emit the event to all renderer processes
asyncRemoteMain.emitRemoteEvent(myEvent, 'The event happened');
```

### Renderer Process
```typescript
import {asyncRemoteRenderer} from 'asyncremote';
import {myEvent} from './path/to/myEvent/file';

asyncRemoteRenderer.onRemoteEvent(myEvent, (arg: string) => {
    console.log(arg); // Logs 'The event happened'
});
```

## `asyncRemoteMain`
The `asyncRemoteMain` module is used by the main process to expose methods and emit events.
It has the following methods:

### registerRemoteMethod
```typescript
asyncRemoteMain.registerRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, execute: (arg: T,caller: Electron.WebContents) => Promise<U>)
```
Exposes a method to the render process.
- `method: AsyncRemote.IMethod` The method descriptor.
- `execute: (T) => U` The function to execute when the method is run by the render process.

### emitRemoteEvent
``` typescript
asyncRemoteMain.emitRemoteEvent<U>(event: AsyncRemote.IEvent<U>, data: U, [...contents: Electron.WebContents])
```
Emits a remote event. If no WebContents are included in the contents parameter, the event is
emitted to all existing WebContents.
- `event: AsyncRemote.IEvent` The event descriptor.
- `data: U` The data to be emitted in the event.
- `...contents: Electron.WebContents` The specific WebContents to emit the event to.

## `asyncRemoteRenderer`
The `asyncRemoteRenderer` module is used by the renderer process to call methods and listen for
events. It has the following methods:

### runRemoteMethod
``` typescript
asyncRemoteRenderer.runRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>, arg: T)
```
Executes a method exposed by the main process.
- `method: AsyncRemote.IMethod` The method descriptor.
- `arg: T` The data to pass to the method.
Returns `Promise<U>` - A promise that is resolved with the output of the main process function.

### createRemoteMethod
``` typescript
asyncRemoteRenderer.createRemoteMethod<T, U>(method: AsyncRemote.IMethod<T, U>)
```
Wraps `runRemoteMethod` to create a callable proxy for the remote method.
- `method: AsyncRemote.IMethod` The method descriptor.
Returns `(arg: T) => Promise<U>` - A callable function that executes the remote method.

### onRemoteEvent
``` typescript
asyncRemoteRenderer.onRemoteEvent<U>(event: AsyncRemote.IEvent<U>, cb: (U) => void)
```
Adds a listener on a remote event.
- `event: AsyncRemote.IEvent` The event descriptor.
- `cb: (U) => void` The function to be called when the event occurs.

### removeRemoteListener
``` typescript
asyncRemoteRenderer.removeRemoteListener<U>(event: AsyncRemote.IEvent<U>, cb: (U) => void)
```
Remove a listener on a remote event.
- `event: AsyncRemote.IEvent` The event descriptor.
- `cb: (U) => void` The listener.


