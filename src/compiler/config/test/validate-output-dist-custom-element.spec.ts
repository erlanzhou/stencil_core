import type * as d from '@stencil/core/declarations';
import { mockConfig, mockLoadConfigInit } from '@stencil/core/testing';
import { DIST_CUSTOM_ELEMENTS, DIST_GLOBAL_STYLES, join } from '@utils';
import path from 'path';

import { validateConfig } from '../validate-config';

describe('validate-output-dist-custom-element', () => {
  const rootDir = path.resolve('/');
  const defaultDistDir = join(rootDir, 'dist', 'components');

  let userConfig: d.Config;

  beforeEach(() => {
    userConfig = mockConfig();
  });

  it('generates dist-custom-elements and dist-global-styles output targets', () => {
    userConfig.outputTargets = [{ type: DIST_CUSTOM_ELEMENTS }];

    const { config } = validateConfig(userConfig, mockLoadConfigInit());
    expect(config.outputTargets).toEqual([
      {
        type: DIST_CUSTOM_ELEMENTS,
        copy: [],
        dir: defaultDistDir,
        empty: true,
        externalRuntime: true,
        generateTypeDeclarations: false,
        customElementsExportBehavior: 'default',
      },
      {
        type: DIST_GLOBAL_STYLES,
        file: join(defaultDistDir, 'testing.css'),
      },
    ]);
  });

  it('uses provided customElementsExportBehavior when valid', () => {
    userConfig.outputTargets = [
      {
        type: DIST_CUSTOM_ELEMENTS,
        customElementsExportBehavior: 'single-export-module',
      },
    ];

    const { config } = validateConfig(userConfig, mockLoadConfigInit());
    const distCeTarget = config.outputTargets.find((o) => o.type === DIST_CUSTOM_ELEMENTS) as d.OutputTargetDistCustomElements;

    expect(distCeTarget.customElementsExportBehavior).toBe('single-export-module');
  });

  it('writes global styles to the custom dist-custom-elements directory', () => {
    userConfig.outputTargets = [
      {
        type: DIST_CUSTOM_ELEMENTS,
        dir: 'my-dist-custom-elements',
      },
    ];

    const { config } = validateConfig(userConfig, mockLoadConfigInit());
    expect(config.outputTargets).toEqual([
      {
        type: DIST_CUSTOM_ELEMENTS,
        copy: [],
        dir: join(rootDir, 'my-dist-custom-elements'),
        empty: true,
        externalRuntime: true,
        generateTypeDeclarations: false,
        customElementsExportBehavior: 'default',
      },
      {
        type: DIST_GLOBAL_STYLES,
        file: join(rootDir, 'my-dist-custom-elements', 'testing.css'),
      },
    ]);
  });

  it('forces generateTypeDeclarations=false and drops copy tasks in reduced profile', () => {
    userConfig.outputTargets = [
      {
        type: DIST_CUSTOM_ELEMENTS,
        generateTypeDeclarations: true,
        copy: [{ src: 'mock/src', dest: 'mock/dest' }],
      },
    ];

    const { config } = validateConfig(userConfig, mockLoadConfigInit());
    const distCeTarget = config.outputTargets.find((o) => o.type === DIST_CUSTOM_ELEMENTS) as d.OutputTargetDistCustomElements;

    expect(distCeTarget.generateTypeDeclarations).toBe(false);
    expect(distCeTarget.copy).toEqual([]);
  });
});
