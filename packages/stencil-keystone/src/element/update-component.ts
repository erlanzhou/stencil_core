import type { HostElement, VNode } from '../internal/types';
import { renderVdom } from '../vdom/vdom-render';
import { getHostRef, HOST_FLAGS, type HostRef } from './host-ref';

/**
 * Queue a (re)render for a host element. Multiple synchronous calls collapse
 * into a single render on the next microtask.
 *
 * @param hostRef the host reference to (re)render
 */
export const scheduleUpdate = (hostRef: HostRef): void => {
  if (hostRef.$flags$ & HOST_FLAGS.isQueuedForUpdate) {
    return;
  }
  hostRef.$flags$ |= HOST_FLAGS.isQueuedForUpdate;
  queueMicrotask(() => updateComponent(hostRef));
};

/**
 * Request a re-render of an already-rendered element from outside the runtime.
 *
 * @param elm the host element to re-render
 */
export const forceUpdate = (elm: HostElement): void => {
  const hostRef = getHostRef(elm);
  if (hostRef && hostRef.$flags$ & HOST_FLAGS.hasRendered) {
    scheduleUpdate(hostRef);
  }
};

/**
 * Run the render pipeline for a host element: lifecycle hooks around a single
 * `render()` whose result is patched into the (shadow) DOM by the kernel. On the
 * initial render an async `componentWillLoad` is awaited before rendering.
 *
 * @param hostRef the host reference to update
 * @returns a promise when the initial `componentWillLoad` is async, else void
 */
const updateComponent = (hostRef: HostRef): void | Promise<void> => {
  hostRef.$flags$ &= ~HOST_FLAGS.isQueuedForUpdate;
  // Eager profile: the element *is* the component instance.
  const instance = hostRef.$hostElement$ as unknown as Record<string, () => unknown>;
  const isInitialLoad = !(hostRef.$flags$ & HOST_FLAGS.hasRendered);

  if (isInitialLoad) {
    const willLoad = safeCall(instance, 'componentWillLoad');
    if (isPromise(willLoad)) {
      return willLoad.then(() => {
        // Watchers become active only after initialization, so changes made
        // during `componentWillLoad` seed state without firing @Watch callbacks.
        hostRef.$flags$ |= HOST_FLAGS.isWatchReady;
        renderInstance(hostRef, instance, isInitialLoad);
      });
    }
    hostRef.$flags$ |= HOST_FLAGS.isWatchReady;
  } else {
    safeCall(instance, 'componentWillUpdate');
  }
  renderInstance(hostRef, instance, isInitialLoad);
};

/**
 * Call `render()` and patch the result, bracketed by the render/loaded/updated
 * lifecycle hooks.
 *
 * @param hostRef the host reference being rendered
 * @param instance the component instance (the host element)
 * @param isInitialLoad whether this is the element's first render
 */
const renderInstance = (
  hostRef: HostRef,
  instance: Record<string, () => unknown>,
  isInitialLoad: boolean,
): void => {
  safeCall(instance, 'componentWillRender');
  const renderResult = (typeof instance.render === 'function' ? instance.render() : null) as
    | VNode
    | VNode[]
    | null;
  renderVdom(hostRef, renderResult, isInitialLoad);
  hostRef.$flags$ |= HOST_FLAGS.hasRendered;
  safeCall(instance, 'componentDidRender');
  safeCall(instance, isInitialLoad ? 'componentDidLoad' : 'componentDidUpdate');
};

const safeCall = (instance: Record<string, () => unknown>, method: string): unknown =>
  typeof instance[method] === 'function' ? instance[method]() : undefined;

const isPromise = (value: unknown): value is Promise<unknown> =>
  !!value && typeof (value as Promise<unknown>).then === 'function';
