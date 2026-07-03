/**
 * `process.env.NODE_ENV` is not a real runtime value in this browser-targeted
 * kernel — the build (`scripts/build.mjs`) statically replaces it via esbuild's
 * `define`. This ambient declaration exists only so type-checking resolves the
 * reference without pulling in Node type definitions.
 */
declare const process: { env: { NODE_ENV?: string } };
