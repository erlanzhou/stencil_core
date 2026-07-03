import { consoleError } from '../internal/platform';
import type { HostElement } from '../internal/types';
import { getHostRef, HOST_FLAGS } from './host-ref';
import type { ComponentRuntimeMeta } from './types';
import { scheduleUpdate } from './update-component';

/**
 * Read a reactive member's current value from the host reference's backing store.
 *
 * @param ref the host element
 * @param propName the member name
 * @returns the stored value, or `undefined` if unset
 */
export const getValue = (ref: HostElement, propName: string): unknown =>
  getHostRef(ref)?.$instanceValues$.get(propName);

/**
 * Write a reactive member's value. If it actually changed: fire any `@Watch`
 * callbacks (once the component is past initialization), then schedule a
 * re-render, provided the element has already rendered once.
 *
 * @param ref the host element
 * @param propName the member name
 * @param newVal the value to store
 * @param cmpMeta runtime metadata (for `@Watch` lookups)
 */
export const setValue = (
  ref: HostElement,
  propName: string,
  newVal: unknown,
  cmpMeta: ComponentRuntimeMeta,
): void => {
  // The host reference is registered at construction (compiler-injected
  // `baseConstructor(this)`), so values set before the element connects — a
  // constructor seeding initial `@State`/`@Prop` values, or a wrapper's
  // `el.prop = x` before mount — already have a host reference to write into.
  const hostRef = getHostRef(ref)!;
  const instanceValues = hostRef.$instanceValues$;
  const oldVal = instanceValues.get(propName);
  if (instanceValues.has(propName) && Object.is(newVal, oldVal)) {
    return;
  }
  instanceValues.set(propName, newVal);

  const instance = ref as unknown as Record<string, unknown>;

  // @Watch callbacks — only once the component is past initialization
  if (cmpMeta.$watched$ && hostRef.$flags$ & HOST_FLAGS.isWatchReady) {
    const watchMethods = cmpMeta.$watched$[propName];
    if (watchMethods) {
      for (const methodName of watchMethods) {
        const method = instance[methodName];
        if (typeof method === 'function') {
          try {
            method.call(instance, newVal, oldVal, propName);
          } catch (err) {
            consoleError(err);
          }
        }
      }
    }
  }

  // Schedule a re-render once the component has rendered. Before the first render
  // (seeding values in the constructor or componentWillLoad) the pending initial
  // render already reflects the change, so nothing is scheduled here; scheduleUpdate
  // itself dedups concurrent changes within a tick.
  if (hostRef.$flags$ & HOST_FLAGS.hasRendered) {
    scheduleUpdate(hostRef);
  }
};
