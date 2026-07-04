import { describe, expect, it } from 'vitest';

import { baseConstructor, createEvent } from '../src/element/index';
import type { HostElement } from '../src/index';

class Emitter extends HTMLElement {
  constructor() {
    super();
    baseConstructor(this as unknown as HostElement);
  }
}
customElements.define('x-emitter', Emitter);

describe('runtime — createEvent', () => {
  it('dispatches a non-bubbling, non-composed, cancelable CustomEvent on the host', () => {
    const el = document.createElement('x-emitter');
    document.body.appendChild(el);
    const emitter = createEvent<{ v: number }>(el as unknown as HostElement, 'change');

    let received: CustomEvent<{ v: number }> | undefined;
    el.addEventListener('change', (e) => (received = e as CustomEvent<{ v: number }>));

    const returned = emitter.emit({ v: 1 });

    expect(received).toBeTruthy();
    expect(received!.bubbles).toBe(false);
    expect(received!.composed).toBe(false);
    expect(received!.cancelable).toBe(true);
    expect(received!.detail).toEqual({ v: 1 });
    expect(returned).toBe(received); // emit returns the dispatched event
  });
});
