import { describe, expect, it } from 'vitest';

import { h } from '../src/index';
import { MEMBER_FLAGS, proxyCustomElement } from '../src/element/index';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('element runtime — slice 3: @Watch + componentShouldUpdate', () => {
  it('fires @Watch with (new, old, name), only after init, and only on change', async () => {
    const changes: Array<[unknown, unknown, string]> = [];
    class Watched extends HTMLElement {
      value = 1;
      onValueChange(newV: unknown, oldV: unknown, name: string) {
        changes.push([newV, oldV, name]);
      }
      render() {
        return h('span', null, `${this.value}`);
      }
    }
    proxyCustomElement(Watched, {
      $tagName$: 'x-watched',
      $members$: { value: [MEMBER_FLAGS.Prop] },
      $watchers$: { value: ['onValueChange'] },
    });
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
    class Init extends HTMLElement {
      value = 1;
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
    proxyCustomElement(Init, {
      $tagName$: 'x-init',
      $members$: { value: [MEMBER_FLAGS.Prop] },
      $watchers$: { value: ['onValueChange'] },
    });
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

  it('skips re-render when componentShouldUpdate returns false', async () => {
    let renderCount = 0;
    class Guarded extends HTMLElement {
      value = 0;
      componentShouldUpdate(newV: number) {
        return newV % 2 === 0; // only re-render on even values
      }
      render() {
        renderCount++;
        return h('span', null, `${this.value}`);
      }
    }
    proxyCustomElement(Guarded, { $tagName$: 'x-guarded', $members$: { value: [MEMBER_FLAGS.Prop] } });
    customElements.define('x-guarded', Guarded);

    const el = document.createElement('x-guarded') as HTMLElement & { value: number };
    document.body.appendChild(el);
    await tick();
    expect(renderCount).toBe(1);

    el.value = 1; // odd → vetoed
    await tick();
    expect(renderCount).toBe(1);

    el.value = 2; // even → renders
    await tick();
    expect(renderCount).toBe(2);
    expect(el.shadowRoot?.textContent).toContain('2');
  });
});
