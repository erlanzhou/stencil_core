import type { HostElement } from '../internal/types';
import { getHostRef, HOST_FLAGS } from './host-ref';
import type { ComponentRuntimeMeta } from './types';

/** Any object indexed by string member name (the element carrying the merge). */
type Indexable = Record<string, unknown>;

/**
 * Per-instance guard: `true` while the runtime is programmatically syncing the
 * internal state (connect seeding, or mirroring a controlled-prop change), so the
 * internal setter stores the value without re-emitting the change event.
 */
const syncing = new WeakMap<object, boolean>();

/**
 * Whether the element is past its first-render initialization (`componentWillLoad` done).
 *
 * @param elm the host element
 * @returns `true` once watchers are ready (past `componentWillLoad`)
 */
const isPastInit = (elm: HostElement): boolean => !!(getHostRef(elm)!.$flags$ & HOST_FLAGS.isWatchReady);

/**
 * Wrap a member's setter, preserving its getter and delegating to the original
 * (reactive) setter via `base`.
 *
 * @param proto the component prototype
 * @param name the member whose setter to wrap
 * @param wrapped the wrapping setter; receives the value and the original setter
 */
const wrapSetter = (
  proto: object,
  name: string,
  wrapped: (this: Indexable, value: unknown, base: ((value: unknown) => void) | undefined) => void,
): void => {
  const desc = Object.getOwnPropertyDescriptor(proto, name);
  const base = desc?.set;
  Object.defineProperty(proto, name, {
    configurable: true,
    enumerable: true,
    get: desc?.get,
    set(this: Indexable, value: unknown): void {
      wrapped.call(this, value, base);
    },
  });
};

/**
 * Install the controlled/uncontrolled merge for every `@Controllable` member,
 * wrapping the controlled-, uncontrolled-, and internal-state setters. Runs once
 * per component class, after {@link defineReactiveMembers}.
 *
 * @param Cstr the component constructor
 * @param cmpMeta runtime metadata carrying `$controllable$`
 */
export const defineControllable = (Cstr: CustomElementConstructor, cmpMeta: ComponentRuntimeMeta): void => {
  const proto = Cstr.prototype as object;

  for (const [internal, controlled, uncontrolled, event] of cmpMeta.$controllable$!) {
    // Parent updates the controlled prop → mirror it into the internal state (no
    // event: the parent already knows). A cleared controlled prop resets to the default.
    wrapSetter(proto, controlled, function (value, base): void {
      syncing.set(this, true);
      const oldValue = this[controlled];
      base?.call(this, value);
      if (value !== oldValue) {
        this[internal] = value === undefined ? this[uncontrolled] : value;
      }
      syncing.set(this, false);
    });

    // The default prop seeds the internal state only while uncontrolled and before
    // the first render; afterwards the default is inert.
    wrapSetter(proto, uncontrolled, function (value, base): void {
      syncing.set(this, true);
      base?.call(this, value);
      if (this[controlled] === undefined && !isPastInit(this as unknown as HostElement)) {
        this[internal] = value;
      }
      syncing.set(this, false);
    });

    // The component writes the merged state: emit the change event, and update the
    // internal state only when uncontrolled (controlled mode waits for the parent
    // to change the controlled prop).
    wrapSetter(proto, internal, function (value, base): void {
      if (syncing.get(this)) {
        base?.call(this, value);
        return;
      }
      const oldValue = this[internal];
      const controlledValue = this[controlled];
      if (event != null && value !== oldValue && value !== controlledValue) {
        (this[event] as { emit?: (value: unknown) => void } | undefined)?.emit?.(value);
      }
      if (controlledValue === undefined) {
        base?.call(this, value);
      }
    });
  }
};

/**
 * Seed each merged internal state from the controlled prop (if controlled) or the
 * default prop (if uncontrolled). Called from `connectedCallback` on every connect.
 *
 * @param elm the host element being connected
 * @param cmpMeta runtime metadata carrying `$controllable$`
 */
export const seedControllable = (elm: HostElement, cmpMeta: ComponentRuntimeMeta): void => {
  const instance = elm as unknown as Indexable;
  for (const [internal, controlled, uncontrolled] of cmpMeta.$controllable$!) {
    syncing.set(instance, true);
    instance[internal] = instance[controlled] === undefined ? instance[uncontrolled] : instance[controlled];
    syncing.set(instance, false);
  }
};
