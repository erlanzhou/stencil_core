import type { RenderHostRef } from '../internal/host-ref';
import type { HostElement, VNode } from '../internal/types';

/**
 * Bit flags tracking a host element's runtime lifecycle state.
 *
 * A plain (non-const) enum so it survives per-file transpilation (e.g. Vitest's
 * esbuild transform, which cannot inline cross-file const enums).
 */
export enum HOST_FLAGS {
  hasConnected = 0b0001,
  hasRendered = 0b0010,
  isQueuedForUpdate = 0b0100,
  isWatchReady = 0b1000,
}

/**
 * Per-element runtime bookkeeping. A superset of {@link RenderHostRef}, so it can
 * be passed straight to `renderVdom`.
 */
export interface HostRef extends RenderHostRef {
  $hostElement$: HostElement;
  $vnode$?: VNode | null;
  $flags$: number;
  /** Backing store for reactive members (`@State`, and `@Prop` without a user setter). */
  $instanceValues$: Map<string, unknown>;
}

/**
 * The runtime host reference is attached directly to the element under this key
 * — the same approach React takes with `__reactFiber$…`/`__reactProps$…` — rather
 * than hidden in a side table. This keeps it reachable from the element itself
 * (`$0.__hostRef$` in devtools), which aids debugging.
 */
const HOST_REF = '__hostRef$';

/**
 * Look up the runtime host reference for an element, if one has been registered.
 *
 * @param elm the host element
 * @returns the host reference, or `undefined` if the element is not registered
 */
export const getHostRef = (elm: HostElement): HostRef | undefined => elm[HOST_REF];

/**
 * Create and store a fresh host reference on an element. Internal primitive;
 * components register through {@link baseConstructor}.
 *
 * @param elm the host element to register
 * @returns the newly created host reference
 */
const registerHost = (elm: HostElement): HostRef => {
  const hostRef: HostRef = {
    $flags$: 0b0000,
    $hostElement$: elm,
    $instanceValues$: new Map(),
  };
  elm[HOST_REF] = hostRef;
  return hostRef;
};

/**
 * The construction-time registration hook the compiler injects as the first
 * statement of a component's constructor:
 *
 * ```js
 * constructor() { super(); baseConstructor(this); }
 * ```
 *
 * Fixing host registration at construction — before any field initializer or a
 * wrapper's pre-mount `el.prop = x` — lets every other runtime site rely on
 * `getHostRef` returning a value instead of registering lazily.
 *
 * @param elm the host element being constructed
 */
export const baseConstructor = (elm: HostElement): void => {
  registerHost(elm);
};
