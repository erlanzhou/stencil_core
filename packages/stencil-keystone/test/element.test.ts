import { describe, expect, it } from 'vitest';

import { h } from '../src/index';
import { forceUpdate, proxyCustomElement } from '../src/element/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 1: lifecycle + render wiring', () => {
  it('renders a no-prop component into its shadow root on connect, and forceUpdate re-renders', async () => {
    let renderCount = 0;
    class MyGreeting extends KeystoneElement {
      render() {
        renderCount++;
        return h('span', null, 'hello');
      }
    }
    proxyCustomElement('my-greeting', MyGreeting);
    customElements.define('my-greeting', MyGreeting);

    const el = document.createElement('my-greeting');
    document.body.appendChild(el);
    await tick();

    expect(el.shadowRoot).toBeTruthy();
    expect(el.shadowRoot?.textContent).toContain('hello');
    expect(renderCount).toBe(1);

    forceUpdate(el);
    await tick();
    expect(renderCount).toBe(2);
  });

  it('runs lifecycle hooks in order, awaiting an async componentWillLoad', async () => {
    const calls: string[] = [];
    class LifecycleCmp extends KeystoneElement {
      async componentWillLoad() {
        calls.push('willLoad');
        await Promise.resolve();
      }
      componentDidLoad() {
        calls.push('didLoad');
      }
      render() {
        calls.push('render');
        return h('div', null, 'x');
      }
    }
    proxyCustomElement('lifecycle-cmp', LifecycleCmp);
    customElements.define('lifecycle-cmp', LifecycleCmp);

    const el = document.createElement('lifecycle-cmp');
    document.body.appendChild(el);
    await tick();
    await tick();

    expect(calls).toEqual(['willLoad', 'render', 'didLoad']);
  });
});
