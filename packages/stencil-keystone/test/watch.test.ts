import { describe, expect, it } from 'vitest';

import { proxyCustomElement } from '../src/element/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 3: @Watch', () => {
  it('fires @Watch with (new, old, name), only after init, and only on change', async () => {
    const changes: Array<[unknown, unknown, string]> = [];
    class Watched extends KeystoneElement {
      declare value: number;
      constructor() {
        super();
        this.value = 1;
      }
      onValueChange(newV: unknown, oldV: unknown, name: string) {
        changes.push([newV, oldV, name]);
      }
      render() {
        return h('span', null, `${this.value}`);
      }
    }
    // `value` is only passed as a watched prop — it still gets a reactive accessor,
    // since watched props are inherently reactive.
    proxyCustomElement('x-watched', Watched, undefined, undefined, { value: ['onValueChange'] });
    customElements.define('x-watched', Watched);

    const el = document.createElement('x-watched') as HTMLElement & { value: number };
    document.body.appendChild(el);
    await tick();
    expect(changes).toEqual([]); // no fire during init (un-shadow seeding value=1)

    el.value = 2;
    await tick();
    expect(changes).toEqual([[2, 1, 'value']]);

    el.value = 2; // unchanged → no fire
    await tick();
    expect(changes).toEqual([[2, 1, 'value']]);
  });

  it('does not fire @Watch for changes made inside componentWillLoad', async () => {
    const changes: unknown[] = [];
    class Init extends KeystoneElement {
      declare value: number;
      constructor() {
        super();
        this.value = 1;
      }
      componentWillLoad() {
        this.value = 99; // setup, should not fire the watcher
      }
      onValueChange(newV: unknown) {
        changes.push(newV);
      }
      render() {
        return h('span', null, `${this.value}`);
      }
    }
    proxyCustomElement('x-init', Init, undefined, undefined, { value: ['onValueChange'] });
    customElements.define('x-init', Init);

    const el = document.createElement('x-init') as HTMLElement & { value: number };
    document.body.appendChild(el);
    await tick();
    expect(changes).toEqual([]);
    expect(el.shadowRoot?.textContent).toContain('99');

    el.value = 100;
    await tick();
    expect(changes).toEqual([100]);
  });
});
