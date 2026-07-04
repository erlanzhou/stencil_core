import type { HostElement } from '../internal/types';
import { getHostRef } from './host-ref';

/** The emitter returned by {@link createEvent}; the compiler seeds `@Event` fields with it. */
export interface EventEmitter<T = unknown> {
  emit: (detail?: T) => CustomEvent<T>;
}

/**
 * Create the emitter the compiler assigns to an `@Event()` field:
 * `this.x = createEvent(this, 'x')`. Events are fixed to `bubbles:false`,
 * `composed:false`, `cancelable:true`, and use the property name verbatim.
 *
 * @param ref the host element (`this` in the compiled constructor)
 * @param name the event name (the `@Event` property name)
 */
export const createEvent = <T = unknown>(ref: HostElement, name: string): EventEmitter<T> => ({
  emit: (detail?: T): CustomEvent<T> => {
    const ev = new CustomEvent<T>(name, {
      bubbles: false,
      composed: false,
      cancelable: true,
      detail: detail as T,
    });
    getHostRef(ref)!.$hostElement$.dispatchEvent(ev);
    return ev;
  },
});
