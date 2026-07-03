import { baseConstructor } from '../src/element/index';
import type { HostElement } from '../src/index';

/**
 * Test-only stand-in for compile-time registration. Production components get
 * `baseConstructor(this)` injected as the first statement of their constructor
 * by the compiler; here a base class calls the same public hook via `super()`
 * (which runs before subclass field initializers), so the runtime's invariant —
 * the host reference exists by the time construction finishes — holds.
 *
 * Deliberately NOT part of the public API: production components extend
 * `HTMLElement` and rely on the injected `baseConstructor` call, so there is no
 * base class to forget. If the injection is ever missing, it fails loudly at
 * construction (`getHostRef(...)!` is undefined) rather than being papered over.
 */
export class KeystoneElement extends HTMLElement {
  constructor() {
    super();
    baseConstructor(this as unknown as HostElement);
  }
}
