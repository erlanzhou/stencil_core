import { describe, expect, it } from 'vitest';

import { createEvent, proxyCustomElement } from '../src/element/index';
import type { HostElement } from '../src/index';
import { h } from '../src/index';
import { KeystoneElement } from './keystone-element';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// A collapsible with the controlled/uncontrolled merge:
//   controlled   = `collapsed`        (@Prop)
//   uncontrolled = `defaultCollapsed` (@Prop)
//   internal     = `merged`           (@State, what the component reads/writes)
//   event        = `ksChange`         (@Event)
const defineCollapsible = (tag: string) => {
  class Collapsible extends KeystoneElement {
    declare collapsed?: boolean;
    declare defaultCollapsed?: boolean;
    declare merged?: boolean;
    declare ksChange: { emit: (v: unknown) => void };
    constructor() {
      super();
      this.ksChange = createEvent(this as unknown as HostElement, 'ksChange');
    }
    render() {
      return h('span', null, String(this.merged));
    }
  }
  proxyCustomElement(tag, Collapsible, undefined, undefined, undefined, undefined, [
    ['merged', 'collapsed', 'defaultCollapsed', 'ksChange'],
  ]);
  customElements.define(tag, Collapsible);
  return () =>
    document.createElement(tag) as HTMLElement & {
      collapsed?: boolean;
      defaultCollapsed?: boolean;
      merged?: boolean;
    };
};

describe('@Controllable — controlled/uncontrolled merge', () => {
  it('uncontrolled: seeds from the default, and a component write updates internal + emits', async () => {
    const make = defineCollapsible('x-unc-uncontrolled');
    const el = make();
    el.defaultCollapsed = true; // no controlled prop → uncontrolled
    document.body.appendChild(el);
    await tick();
    expect(el.merged).toBe(true); // seeded from the default

    const events: unknown[] = [];
    el.addEventListener('ksChange', (e) => events.push((e as CustomEvent).detail));

    el.merged = false; // component (user) toggles the merged state
    expect(el.merged).toBe(false); // uncontrolled → internal updates optimistically
    expect(events).toEqual([false]); // change emitted
  });

  it('controlled: a component write emits but does NOT change internal; the parent owns it', async () => {
    const make = defineCollapsible('x-unc-controlled');
    const el = make();
    el.collapsed = true; // controlled
    document.body.appendChild(el);
    await tick();
    expect(el.merged).toBe(true); // seeded from the controlled prop

    const events: unknown[] = [];
    el.addEventListener('ksChange', (e) => events.push((e as CustomEvent).detail));

    el.merged = false; // component requests a change
    expect(el.merged).toBe(true); // internal unchanged — controlled by parent
    expect(events).toEqual([false]); // change requested via event

    el.collapsed = false; // parent responds by updating the controlled prop
    expect(el.merged).toBe(false); // internal syncs to the controlled value
    expect(events).toEqual([false]); // ...without emitting a second event
  });

  it('switching controlled → uncontrolled resets internal to the default', async () => {
    const make = defineCollapsible('x-unc-switch');
    const el = make();
    el.defaultCollapsed = false;
    el.collapsed = true; // start controlled
    document.body.appendChild(el);
    await tick();
    expect(el.merged).toBe(true);

    el.collapsed = undefined; // hand control back
    expect(el.merged).toBe(false); // reset to the default
  });

  it('does not emit when the merged state is written to its current value', async () => {
    const make = defineCollapsible('x-unc-noop');
    const el = make();
    el.defaultCollapsed = true;
    document.body.appendChild(el);
    await tick();

    const events: unknown[] = [];
    el.addEventListener('ksChange', (e) => events.push((e as CustomEvent).detail));
    el.merged = true; // same value
    expect(events).toEqual([]); // no change → no event
  });
});
