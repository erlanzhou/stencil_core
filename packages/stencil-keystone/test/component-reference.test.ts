import { describe, expect, it } from 'vitest';

import { proxyCustomElement } from '../src/element/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// A component compiled by kstencil is a real importable value (the class, tagged
// with `$ksTag$` by proxyCustomElement). Using it in JSX (`<Child/>` → h(Child, ...))
// resolves to its custom-element tag, lazily registers it, and sets props — the
// React-like "reference the component directly" model.
describe('component references (import + <Child/>)', () => {
  it('resolves a component reference to its tag and lazily registers it', () => {
    class Child extends KeystoneElement {
      declare label: string;
      render() {
        return h('span', null, String(this.label));
      }
    }
    const ChildRef = proxyCustomElement('x-childref', Child, undefined, ['label']);
    // proxyCustomElement does not register — h should, lazily, on first use.
    expect(customElements.get('x-childref')).toBeUndefined();

    const vnode = h(ChildRef, { label: 'hi' });
    expect(vnode.$tag$).toBe('x-childref'); // reference resolved to its tag
    expect(customElements.get('x-childref')).toBe(Child); // lazily registered
  });

  it('renders a referenced child into the parent and sets its props as properties', async () => {
    class Child extends KeystoneElement {
      declare label: string;
      render() {
        return h('span', null, `child:${this.label}`);
      }
    }
    const ChildRef = proxyCustomElement('x-child-ref2', Child, undefined, ['label']);
    customElements.define('x-child-ref2', Child);

    class Parent extends KeystoneElement {
      render() {
        return h(ChildRef, { label: 'world' });
      }
    }
    proxyCustomElement('x-parent-ref2', Parent);
    customElements.define('x-parent-ref2', Parent);

    const el = document.createElement('x-parent-ref2');
    document.body.appendChild(el);
    await tick();

    const child = el.shadowRoot?.querySelector('x-child-ref2') as (HTMLElement & { label: string }) | null;
    expect(child).toBeTruthy();
    expect(child!.label).toBe('world'); // prop set as a JS property
    await tick();
    expect(child!.shadowRoot?.textContent).toContain('child:world');
  });

  it('still calls a plain functional component (no $ksTag$)', () => {
    const Fn = (props: { x: number }) => h('span', null, String(props.x));
    const vnode = h(Fn, { x: 5 });
    expect(vnode.$tag$).toBe('span'); // Fn was called (not treated as a tag)
    expect(vnode.$children$?.[0]?.$text$).toBe('5');
  });
});
