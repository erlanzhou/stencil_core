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
 * re-render — unless `componentShouldUpdate` vetoes it — provided the element has
 * already rendered once.
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
  const hostRef = getHostRef(ref);
  if (!hostRef) {
    return;
  }
  const instanceValues = hostRef.$instanceValues$;
  const oldVal = instanceValues.get(propName);
  if (instanceValues.has(propName) && Object.is(newVal, oldVal)) {
    return;
  }
  instanceValues.set(propName, newVal);

  const instance = ref as unknown as Record<string, unknown>;

  // @Watch callbacks — only once the component is past initialization
  if (cmpMeta.$watchers$ && hostRef.$flags$ & HOST_FLAGS.isWatchReady) {
    const watchMethods = cmpMeta.$watchers$[propName];
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

  if (hostRef.$flags$ & HOST_FLAGS.hasRendered) {
    const shouldUpdate = instance.componentShouldUpdate;
    if (
      typeof shouldUpdate === 'function' &&
      shouldUpdate.call(instance, newVal, oldVal, propName) === false &&
      !(hostRef.$flags$ & HOST_FLAGS.isQueuedForUpdate)
    ) {
      return;
    }
    scheduleUpdate(hostRef);
  }
};
