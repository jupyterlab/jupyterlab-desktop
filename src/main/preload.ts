// atob implementation below is modified from node.js source 
// (https://github.com/nodejs/node/blob/master/lib/buffer.js)
// and copyright below is for it

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

/*
  Override atob implementation with a modified version that allows whitespaces.
  When contextIsolation is off, electron uses atob implementation from node.js
  which does not allow whitespaces. this override won't be needed once
  contextIsolation is turned on.
*/
window.atob = (input): string => {
    const kBase64Digits =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';

    // remove whitespace
    input = `${input}`.replace(/\s/g, "");
    for (let n = 0; n < input.length; n++) {
        if (!kBase64Digits.includes(input[n])) {
            throw new DOMException('Invalid character', 'InvalidCharacterError');
        }
    }

    return Buffer.from(input, 'base64').toString('latin1');
}
