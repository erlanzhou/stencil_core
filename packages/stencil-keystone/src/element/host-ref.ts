import type { RenderHostRef } from '../internal/host-ref';
import type { HostElement, VNode } from '../internal/types';

/**
 * Bit flags tracking a host element's runtime lifecycle state.
 *
 * A plain (non-const) enum so it survives per-file transpilation (e.g. Vitest's
 * esbuild transform, which cannot inline cross-file const enums).
 */
export enum HOST_FLAGS {
  hasConnected = 1 << 0,
  hasRendered = 1 << 1,
  isQueuedForUpdate = 1 << 2,
  isConstructingInstance = 1 << 3,
  isWatchReady = 1 << 4,
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

const hostRefs = new WeakMap<HostElement, HostRef>();

/**
 * Look up the runtime host reference for an element, if one has been registered.
 *
 * @param elm the host element
 * @returns the host reference, or `undefined` if the element is not registered
 */
export const getHostRef = (elm: HostElement): HostRef | undefined => hostRefs.get(elm);

/**
 * Create and store a fresh host reference for an element.
 *
 * @param elm the host element to register
 * @returns the newly created host reference
 */
export const registerHost = (elm: HostElement): HostRef => {
  const hostRef: HostRef = {
    $flags$: 0,
    $hostElement$: elm,
    $instanceValues$: new Map(),
  };
  hostRefs.set(elm, hostRef);
  return hostRef;
};
