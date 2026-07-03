/**
 * Runtime member metadata: maps a member name to its bit flags (see
 * {@link MEMBER_FLAGS}). Kept as a tuple to leave room for future per-member data.
 */
export type ComponentRuntimeMembers = Record<string, readonly [flags: number]>;

/**
 * The minimal component runtime metadata needed to wire a custom element.
 */
export interface ComponentRuntimeMeta {
  $tagName$: string;
  $flags$?: number;
  $members$?: ComponentRuntimeMembers;
  /** Maps a member name to the method names that `@Watch` it. */
  $watchers$?: Record<string, string[]>;
  /** The component's CSS text, adopted into the shadow root as a stylesheet. */
  $style$?: string;
}
