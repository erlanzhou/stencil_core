import type { HostElement } from '../internal/types';
import { getValue, setValue } from './set-value';
import type { ComponentRuntimeMeta } from './types';

/**
 * Define reactive accessors on a component prototype for every `@Prop`/`@State`
 * member. Reads/writes route through the host reference's backing store so that
 * assignments schedule a re-render. Any getter/setter the author already declared
 * for a member is preserved and wrapped (so computed/validated props keep working
 * while remaining reactive).
 *
 * @param Cstr the component constructor whose prototype is augmented
 * @param cmpMeta runtime metadata for the component
 */
export const defineReactiveMembers = (Cstr: CustomElementConstructor, cmpMeta: ComponentRuntimeMeta): void => {
  const proto = Cstr.prototype as object;

  // A watched property is inherently reactive, so fold `$watched$` keys into the
  // set of members that get accessors — the compiler can then omit them from
  // `$members$` instead of listing every watched prop twice in cmpMeta.
  const memberNames = new Set([...(cmpMeta.$members$ ?? []), ...Object.keys(cmpMeta.$watched$ ?? {})]);

  for (const memberName of memberNames) {
    // Preserve any author-declared getter/setter for this member.
    const descriptor = Object.getOwnPropertyDescriptor(proto, memberName);
    const origGetter = descriptor?.get;
    const origSetter = descriptor?.set;

    Object.defineProperty(proto, memberName, {
      get(this: HostElement): unknown {
        return origGetter ? origGetter.call(this) : getValue(this, memberName);
      },
      set(this: HostElement, newValue: unknown): void {
        if (origSetter) {
          origSetter.call(this, newValue);
          // store the (possibly normalized) value the author's setter produced
          setValue(this, memberName, origGetter ? origGetter.call(this) : newValue, cmpMeta);
        } else {
          setValue(this, memberName, newValue, cmpMeta);
        }
      },
      configurable: true,
      enumerable: true,
    });
  }
};
