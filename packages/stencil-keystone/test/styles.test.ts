import { describe, expect, it } from 'vitest';

import { h } from '../src/index';
import { proxyCustomElement } from '../src/element/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 4: shadow styles', () => {
  it('adopts registered stylesheets into the shadow root', async () => {
    class Styled extends KeystoneElement {
      render() {
        return h('span', null, 'hi');
      }
    }
    proxyCustomElement('x-styled', Styled, [':host{color:red}']);
    customElements.define('x-styled', Styled);

    const el = document.createElement('x-styled');
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot).toBeTruthy();
    const sheets = el.shadowRoot?.adoptedStyleSheets ?? [];
    expect(sheets.length).toBe(1);
    expect(el.shadowRoot?.textContent).toContain('hi');
  });

  it('adopts multiple style chunks', async () => {
    class Multi extends KeystoneElement {
      render() {
        return h('span', null, 'x');
      }
    }
    proxyCustomElement('x-multi', Multi, [':host{display:block}', 'span{color:blue}']);
    customElements.define('x-multi', Multi);

    const el = document.createElement('x-multi');
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot?.adoptedStyleSheets.length).toBe(2);
  });

  it('shares one stylesheet across instances', async () => {
    class Shared extends KeystoneElement {
      render() {
        return h('span', null, 'x');
      }
    }
    proxyCustomElement('x-shared', Shared, [':host{display:block}']);
    customElements.define('x-shared', Shared);

    const a = document.createElement('x-shared');
    const b = document.createElement('x-shared');
    document.body.appendChild(a);
    document.body.appendChild(b);
    await tick();

    const sheetA = a.shadowRoot?.adoptedStyleSheets?.[0];
    const sheetB = b.shadowRoot?.adoptedStyleSheets?.[0];
    expect(sheetA).toBeTruthy();
    expect(sheetA).toBe(sheetB); // same shared constructable stylesheet
  });

  it('dedupes identical CSS across different components (content-keyed reuse)', async () => {
    const shared = ':host{outline:1px solid}';
    class CompA extends KeystoneElement {
      render() {
        return h('span', null, 'a');
      }
    }
    class CompB extends KeystoneElement {
      render() {
        return h('span', null, 'b');
      }
    }
    proxyCustomElement('x-a', CompA, [shared]);
    proxyCustomElement('x-b', CompB, [shared]);
    customElements.define('x-a', CompA);
    customElements.define('x-b', CompB);

    const a = document.createElement('x-a');
    const b = document.createElement('x-b');
    document.body.appendChild(a);
    document.body.appendChild(b);
    await tick();

    // different components, identical CSS text → one reused CSSStyleSheet instance
    expect(a.shadowRoot?.adoptedStyleSheets?.[0]).toBe(b.shadowRoot?.adoptedStyleSheets?.[0]);
  });
});
