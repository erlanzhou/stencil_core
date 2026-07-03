import type { HostElement } from '../internal/types';
import { REACTIVE_MEMBER } from './constants';
import { getValue, setValue } from './set-value';
import type { ComponentRuntimeMeta } from './types';

/**
 * Define reactive accessors on a component prototype for every `@Prop`/`@State`
 * member. Reads/writes route through the host reference's backing store so that
 * assignments schedule a re-render. Any getter/setter the author already declared
 * for a member is preserved and wrapped (so computed/validated props keep working
 * while remaining reactive).
 *
 * @param Cstr the component constructor to augment
 * @param cmpMeta runtime metadata for the component
 * @returns the same constructor, augmented
 */
export const proxyComponent = <T extends CustomElementConstructor>(
  Cstr: T,
  cmpMeta: ComponentRuntimeMeta,
): T => {
  const proto = Cstr.prototype as object;
  const members = cmpMeta.$members$;
  if (members) {
    for (const memberName of Object.keys(members)) {
      const memberFlags = members[memberName][0];
      if (!(memberFlags & REACTIVE_MEMBER)) {
        continue;
      }

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
  }
  return Cstr;
};

/**
 * Reconcile own properties that shadow the reactive accessors, seeding the
 * backing store. Class field initializers (`count = 0`) and any values a wrapper
 * assigned before the element upgraded are created with define semantics, so they
 * sit as own data properties that hide the prototype accessors. Deleting them and
 * re-assigning routes the value back through the accessor.
 *
 * @param elm the host element instance
 * @param cmpMeta runtime metadata for the component
 */
export const unshadowMembers = (elm: HostElement, cmpMeta: ComponentRuntimeMeta): void => {
  const members = cmpMeta.$members$;
  if (!members) {
    return;
  }
  const target = elm as unknown as Record<string, unknown>;
  for (const memberName of Object.keys(members)) {
    if (Object.prototype.hasOwnProperty.call(elm, memberName)) {
      const value = target[memberName];
      delete target[memberName];
      target[memberName] = value;
    }
  }
};
