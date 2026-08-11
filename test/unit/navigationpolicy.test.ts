import { describe, expect, it } from 'vitest';
import { classifyNavigation } from '../../src/main/navigationpolicy';

const server = 'http://localhost:8888/lab?token=secret';

const navigate = (target: string) =>
  classifyNavigation({ target, serverUrl: server, kind: 'navigate' });

const redirect = (target: string) =>
  classifyNavigation({ target, serverUrl: server, kind: 'redirect' });

describe('classifyNavigation', () => {
  it('keeps a target on the server origin in the lab view', () => {
    expect(navigate('http://localhost:8888/lab/tree/notebook.ipynb')).toBe(
      'in-view'
    );
  });

  it('keeps a server redirect that stays on the server origin in the lab view', () => {
    expect(redirect('http://localhost:8888/hub/login')).toBe('in-view');
  });

  it('sends a link followed from server content to the system browser', () => {
    expect(navigate('https://example.com/docs')).toBe('external');
  });

  it('runs an off-origin server redirect in the sign-in window', () => {
    expect(
      redirect('https://team.cloudflareaccess.com/cdn-cgi/access/login')
    ).toBe('auth-window');
  });

  it('opens a mailto link from server content in the system browser', () => {
    expect(navigate('mailto:tutor@example.com')).toBe('external');
  });

  it('blocks a javascript: target followed from server content', () => {
    expect(navigate('javascript:alert(1)')).toBe('block');
  });

  it.each(['file:///etc/passwd', 'data:text/html,<h1>hi</h1>', 'not a url'])(
    'blocks %s followed from server content',
    target => {
      expect(navigate(target)).toBe('block');
    }
  );

  it.each([
    'file:///etc/passwd',
    'data:text/html,<h1>hi</h1>',
    'javascript:alert(1)',
    'not a url'
  ])('blocks %s reached through a server redirect', target => {
    expect(redirect(target)).toBe('block');
  });

  it('never turns a mailto redirect into a sign-in window', () => {
    expect(redirect('mailto:tutor@example.com')).toBe('external');
  });

  it('blocks every navigation when the server URL is unknown', () => {
    const target = 'https://example.com/';

    expect(
      classifyNavigation({ target, serverUrl: undefined, kind: 'navigate' })
    ).toBe('block');
    expect(
      classifyNavigation({ target, serverUrl: 'not a url', kind: 'redirect' })
    ).toBe('block');
  });
});

describe('a sign-in chain may not leave TLS behind', () => {
  const secure = 'https://hub.example.org/lab';
  const redirectFrom = (server: string) => (target: string) =>
    classifyNavigation({ target, serverUrl: server, kind: 'redirect' });

  it('blocks a redirect from an https server to an http sign-in page', () => {
    expect(redirectFrom(secure)('http://idp.example.org/login')).toBe('block');
  });

  it('still runs an https sign-in chain from an https server', () => {
    expect(redirectFrom(secure)('https://idp.example.org/login')).toBe(
      'auth-window'
    );
  });

  it('leaves an http server alone, since it is cleartext either way', () => {
    expect(redirectFrom('http://localhost:8888/lab')('http://idp/login')).toBe(
      'auth-window'
    );
  });
});
