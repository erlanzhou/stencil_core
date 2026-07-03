/**
 * The minimal component runtime metadata needed to wire a custom element.
 */
export interface ComponentRuntimeMeta {
  $tagName$: string;
  /**
   * The names of the reactive members (`@Prop`/`@State`) to define accessors for.
   * There is no Prop-vs-State distinction at runtime: props are set as JS
   * properties by the (React) wrapper, never reflected to or observed from
   * attributes, so both kinds behave identically — a reactive field.
   *
   * Watched properties are inherently reactive and are taken from `$watched$`, so
   * a prop that appears there does NOT need to be repeated here.
   */
  $members$?: string[];
  /**
   * Maps a watched property name to the method names that `@Watch` it. Its keys
   * are also reactive members, so they get accessors defined without needing to
   * be listed again in `$members$`.
   */
  $watched$?: Record<string, string[]>;
  /**
   * The component's CSS chunks, each adopted into the shadow root as a shared
   * constructable stylesheet. Chunks are deduped by content, so a stylesheet
   * shared across components is parsed once and reused.
   */
  $styles$?: string[];
}
