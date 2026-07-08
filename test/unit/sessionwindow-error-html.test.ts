import { describe, expect, it } from 'vitest';
import { errorMessageRow } from '../../src/main/sessionwindow/sessionwindow';

// Progress-view detail is set via innerHTML, so the error text must be escaped
// before it reaches the row. These pin that the single choke-point escapes
// markup and coerces non-string errors.
describe('errorMessageRow', () => {
  it('escapes markup so an error cannot break out of the message row', () => {
    const html = errorMessageRow('<img src=x onerror=alert(1)>');
    expect(html).not.toMatch(/<img|<script/i);
    expect(html).toContain('&lt;img');
    expect(html.startsWith('<div class="message-row">')).toBe(true);
    expect(html.endsWith('</div>')).toBe(true);
  });

  it('escapes the ampersand and angle brackets of a real traceback', () => {
    const html = errorMessageRow('spawn failed: <a> & </a>');
    expect(html).toBe(
      '<div class="message-row">spawn failed: &lt;a&gt; &amp; &lt;/a&gt;</div>'
    );
  });

  it('coerces a non-string error to a string', () => {
    expect(errorMessageRow(new Error('boom'))).toBe(
      '<div class="message-row">Error: boom</div>'
    );
  });
});
