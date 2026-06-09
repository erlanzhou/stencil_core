import { normalizePath } from '@utils';
import type { Plugin } from 'rollup';

import type * as d from '../../declarations';

/**
 * Rollup plugin used to materialize component entry modules from component
 * metadata. Previously lived under the lazy output-target implementation, but
 * it's shared bundling infrastructure and still required by the reduced
 * runtime profile.
 */
export const lazyComponentPlugin = (buildCtx: d.BuildCtx): Plugin => {
  const entries = new Map<string, d.EntryModule>();

  return {
    name: 'lazyComponentPlugin',

    resolveId(importee) {
      const entryModule = buildCtx.entryModules.find((entryModule) => entryModule.entryKey === importee);
      if (entryModule) {
        entries.set(importee, entryModule);
        return importee;
      }

      return null;
    },

    load(id) {
      const entryModule = entries.get(id);
      if (entryModule) {
        return entryModule.cmps.map(createComponentExport).join('\n');
      }
      return null;
    },
  };
};

const createComponentExport = (cmp: d.ComponentCompilerMeta): string => {
  const originalClassName = cmp.componentClassName;
  const underscoredClassName = cmp.tagName.replace(/-/g, '_');
  const filePath = normalizePath(cmp.sourceFilePath);
  return `export { ${originalClassName} as ${underscoredClassName} } from '${filePath}';`;
};

