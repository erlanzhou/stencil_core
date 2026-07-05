import type { HostElement } from '../internal/types';
import { getValue, setValue } from './set-value';
import type { ComponentRuntimeMeta } from './types';

/**
 * Vue 2 binds a `value` prop in two writes: `el._value = raw` (the pre-coercion
 * value) then `el.value = String(raw)` (DOM `value` must be a string). This
 * WeakMap remembers the stringified form we expect Vue to write next, so the
 * reactive `value` setter can swallow that echo instead of clobbering the raw
 * value with a string. Keyed by element; each entry is consumed by the next
 * `value` write. Stays empty — and the whole shim inert — unless something
 * actually writes `_value`, so React-style direct `value` assignment is
 * unaffected.
 */
const vueValueEcho = new WeakMap<object, string>();

/**
 * Define reactive accessors on a component prototype for every `@Prop`/`@State`
 * member. Reads/writes route through the host reference's backing store so that
 * assignments schedule a re-render. Any getter/setter the author already declared
 * for a member is preserved and wrapped (so computed/validated props keep working
 * while remaining reactive).
 *
 * A member named `value` additionally gets a Vue 2 compatibility shim (see
 * {@link vueValueEcho}): a `_value` alias that writes the pre-coercion value
 * straight through to the reactive `value`, plus a guard that drops the
 * stringified echo Vue writes immediately afterwards.
 *
 * @param Cstr the component constructor whose prototype is augmented
 * @param cmpMeta runtime metadata for the component
 */
export const defineReactiveMembers = (Cstr: CustomElementConstructor, cmpMeta: ComponentRuntimeMeta): void => {
  const proto = Cstr.prototype as object;

  // `$defaults$` and `$watched$` keys are inherently reactive members, so fold
  // them into the set that gets accessors — the compiler then omits those names
  // from `$members$` instead of listing them twice in cmpMeta.
  const memberNames = new Set([
    ...(cmpMeta.$members$ ?? []),
    ...Object.keys(cmpMeta.$defaults$ ?? {}),
    ...Object.keys(cmpMeta.$watched$ ?? {}),
    // internal / controlled / uncontrolled names (not the change event) are members too
    ...(cmpMeta.$controllable$ ?? []).flatMap(([internal, controlled, uncontrolled]) => [
      internal,
      controlled,
      uncontrolled,
    ]),
  ]);

  for (const memberName of memberNames) {
    // Preserve any author-declared getter/setter for this member.
    const descriptor = Object.getOwnPropertyDescriptor(proto, memberName);
    const origGetter = descriptor?.get;
    const origSetter = descriptor?.set;

    // The core reactive write (respecting an author setter). The `_value`
    // write-through calls this directly, so it is never swallowed by the echo guard.
    const reactiveSet = function (this: HostElement, newValue: unknown): void {
      if (origSetter) {
        origSetter.call(this, newValue);
        // store the (possibly normalized) value the author's setter produced
        setValue(this, memberName, origGetter ? origGetter.call(this) : newValue, cmpMeta);
      } else {
        setValue(this, memberName, newValue, cmpMeta);
      }
    };

    const isValue = memberName === 'value';

    Object.defineProperty(proto, memberName, {
      get(this: HostElement): unknown {
        if (origGetter) {
          return origGetter.call(this);
        }
        const value = getValue(this, memberName);
        // Return the default when unset (React/Vue defaultProps semantics). `@State`
        // has no `$defaults$` entry, so setting it to undefined keeps undefined.
        return value === undefined ? cmpMeta.$defaults$?.[memberName] : value;
      },
      set: isValue
        ? function (this: HostElement, newValue: unknown): void {
            // Swallow Vue 2's stringified echo of a preceding `_value` write, so it
            // doesn't overwrite the raw value that the write-through already set.
            // A single `get` keeps the common no-echo path to one lookup — the echo
            // is always a string, so `undefined` unambiguously means "not armed".
            const echo = vueValueEcho.get(this);
            if (echo !== undefined) {
              vueValueEcho.delete(this);
              if (newValue === echo) {
                return;
              }
            }
            reactiveSet.call(this, newValue);
          }
        : reactiveSet,
      configurable: true,
      enumerable: true,
    });

    if (isValue) {
      // Vue 2 compat: `el._value = raw` writes the pre-coercion value straight
      // into the reactive `value` and arms the echo guard for the
      // `el.value = String(raw)` that Vue writes immediately after.
      Object.defineProperty(proto, '_value', {
        get(this: HostElement): unknown {
          const value = getValue(this, 'value');
          return value === undefined ? cmpMeta.$defaults$?.value : value;
        },
        set(this: HostElement, raw: unknown): void {
          // Match Vue's own stringification (undefined/null → '').
          vueValueEcho.set(this, raw === undefined || raw === null ? '' : `${raw}`);
          reactiveSet.call(this, raw);
        },
        configurable: true,
        enumerable: false,
      });
    }
  }
};
