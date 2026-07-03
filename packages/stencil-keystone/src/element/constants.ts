/**
 * Bit flags describing a component member.
 *
 * A plain (non-const) enum so it survives per-file transpilation (Vitest's
 * esbuild transform cannot inline cross-file const enums).
 */
export enum MEMBER_FLAGS {
  Prop = 1 << 0,
  State = 1 << 1,
  Method = 1 << 2,
  Mutable = 1 << 3,
}

/** Members that participate in reactive rendering. */
export const REACTIVE_MEMBER = MEMBER_FLAGS.Prop | MEMBER_FLAGS.State;
