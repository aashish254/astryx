// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The icon-set checks of `integration check` (AST-084 FR13, FR14):
 * every error and warning FR14 lists, read statically, and how `--strict`
 * treats the warnings.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {iconSetIssues} from './icon-set-checks.mjs';
import {moduleExportOrigin} from './module-exports.mjs';
import {integrationCheck} from '../../api/integration/check/check.mjs';
import {
  glyphsData,
  glyphsModules,
  writeIconPackage,
} from '../../test-utils/icon-set-fixture.mjs';

/** @type {string} */
let tmp;
/** @type {string} */
let dir;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-icon-checks-'));
  dir = path.join(tmp, 'glyphs');
});
afterEach(() => {
  fs.rmSync(tmp, {recursive: true, force: true});
});

/** @param {import('../../test-utils/icon-set-fixture.mjs').IconPackageSpec} [spec] */
function issuesOf(spec = {}) {
  writeIconPackage(dir, spec);
  return iconSetIssues(dir, {
    name: spec.name ?? '@acme/glyphs',
    iconSets: path.join(dir, 'icon-sets'),
  });
}

/** @param {(data: any) => void} change */
function data(change) {
  const value = /** @type {any} */ ({...glyphsData(), module: '@acme/glyphs'});
  change(value);
  return value;
}

/** @param {Record<string, string>} changes */
function modules(changes) {
  return {...glyphsModules(), ...changes};
}

describe('iconSetIssues', () => {
  it('a set that matches its package has no issues', () => {
    expect(issuesOf()).toEqual([]);
  });

  it('follows re-exports, renames, and export * to the declaring file', () => {
    writeIconPackage(dir);
    expect(
      moduleExportOrigin(path.join(dir, 'index.js'), 'TrashSolidIcon'),
    ).toEqual({
      file: path.join(dir, 'icons', 'trash.js'),
      name: 'TrashSolidIcon',
    });
  });

  it('an invalid data file is an error', () => {
    const issues = issuesOf({data: data(d => (d.icons[1].id = 'x'))});
    expect(issues).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(issues[0].message).toMatch(/duplicate id "x"/);
  });

  it('an export or variant export the module lacks is an error', () => {
    const issues = issuesOf({
      data: data(d => {
        d.icons[3].export = 'HouseIcon';
        d.icons[2].variants[0].export = 'TrashFilledIcon';
      }),
    });
    expect(issues.map(issue => issue.code)).toEqual([
      'icon_export_missing',
      'icon_export_missing',
    ]);
    const messages = issues.map(issue => issue.message).join('\n');
    expect(messages).toContain('HouseIcon');
    expect(messages).toContain('TrashFilledIcon');
  });

  it('a type-only export is not a runtime export', () => {
    const issues = issuesOf({
      modules: modules({
        'icons/home.js': '',
        'index.js': glyphsModules()['index.js'].replace(
          "export {HomeIcon} from './icons/home.js';",
          'export type HomeIcon = unknown;',
        ),
      }),
    });
    expect(issues).toEqual([
      expect.objectContaining({code: 'icon_export_missing'}),
    ]);
  });

  it('a match with an unknown confidence or naming the set itself is an error', () => {
    const unknown = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {set: 'heroicons', export: 'XMarkIcon', confidence: 'maybe'},
          ]),
      ),
    });
    expect(unknown).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(unknown[0].message).toMatch(/confidence/);
    fs.rmSync(dir, {recursive: true});
    const self = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {set: 'glyphs', export: 'XIcon', confidence: 'exact'},
          ]),
      ),
    });
    expect(self).toEqual([
      expect.objectContaining({code: 'invalid_icon_set', severity: 'error'}),
    ]);
    expect(self[0].message).toMatch(/names this set itself/);
    fs.rmSync(dir, {recursive: true});
    const valid = issuesOf({
      data: data(
        d =>
          (d.icons[0].matches = [
            {
              set: 'heroicons',
              export: 'XMarkIcon',
              variant: '24/outline',
              confidence: 'exact',
            },
          ]),
      ),
    });
    expect(valid).toEqual([]);
  });

  it('a module that does not resolve from the package is an error', () => {
    const issues = issuesOf({
      data: data(d => (d.icons[0].module = '@acme/glyphs/solid')),
    });
    expect(issues).toEqual([
      expect.objectContaining({code: 'icon_export_missing'}),
    ]);
    expect(issues[0].message).toMatch(/does not resolve/);
  });

  describe('theme map (FR13)', () => {
    it('an extra key is an error', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js': glyphsModules()['theme.js'].replace(
            '};',
            '  menu: XIcon,\n};',
          ),
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/has "menu", which no icon fills/);
    });

    it('a missing key is an error', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nexport const themeIcons = {close: XIcon};\n",
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/has no "search"/);
    });

    it('wrong artwork is an error, an aliased import of the right artwork is not', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nimport {HomeIcon} from './icons/home.js';\nexport const themeIcons = {close: XIcon, search: HomeIcon};\n",
        }),
      });
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
      expect(issues[0].message).toMatch(/maps "search" to other artwork/);
    });

    it('reads JSX elements as the artwork they render', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js':
            "import {XIcon} from './icons/x.js';\nimport {SearchIcon} from './icons/search.js';\nexport const themeIcons = {close: <XIcon />, search: <SearchIcon />};\n",
        }),
      });
      expect(issues).toEqual([]);
    });

    it('a set that fills names but has no themeMap is an error', () => {
      const issues = issuesOf({data: data(d => delete d.themeMap)});
      expect(issues).toEqual([
        expect.objectContaining({code: 'icon_theme_map_mismatch'}),
      ]);
    });

    it('a map built at runtime is left unchecked, not reported', () => {
      const issues = issuesOf({
        modules: modules({
          'theme.js': 'export const themeIcons = Object.fromEntries([]);\n',
        }),
      });
      expect(issues).toEqual([]);
    });
  });

  describe('upstream (warnings)', () => {
    /** @param {string} installed */
    const withUpstream = (installed, notice = true) => {
      const upstream = path.join(dir, 'node_modules', 'upstream-icons');
      fs.mkdirSync(upstream, {recursive: true});
      fs.writeFileSync(
        path.join(upstream, 'package.json'),
        JSON.stringify({name: 'upstream-icons', version: installed}),
      );
      return issuesOf({
        notice,
        dependencies: {'upstream-icons': '^1.0.0'},
        data: data(
          d => (d.source = {package: 'upstream-icons', version: '1.2.0'}),
        ),
      });
    };

    it('data generated from another upstream version warns', () => {
      expect(withUpstream('1.3.0')).toEqual([
        expect.objectContaining({
          code: 'icon_source_version_drift',
          severity: 'warning',
        }),
      ]);
      expect(withUpstream('1.2.0')).toEqual([]);
    });

    it('no license notice for a set with an upstream warns', () => {
      expect(withUpstream('1.2.0', false)).toEqual([
        expect.objectContaining({
          code: 'icon_license_notice_missing',
          severity: 'warning',
        }),
      ]);
    });
  });
});

describe('integration check over an icon set', () => {
  it('an error fails the run; a warning fails only under --strict', async () => {
    writeIconPackage(dir, {
      notice: false,
      data: data(
        d => (d.source = {package: 'upstream-icons', version: '1.2.0'}),
      ),
    });
    const loose = await integrationCheck({cwd: dir});
    const strict = await integrationCheck({cwd: dir, strict: true});
    expect(loose.data.failed).toBe(false);
    expect(strict.data.failed).toBe(true);
    expect(JSON.stringify(strict.data)).toContain(
      'icon_license_notice_missing',
    );

    fs.rmSync(dir, {recursive: true});
    writeIconPackage(dir, {data: data(d => (d.icons[0].export = 'Nope'))});
    const broken = await integrationCheck({cwd: dir});
    expect(broken.data.failed).toBe(true);
    expect(JSON.stringify(broken.data)).toContain('icon_export_missing');
  }, 60_000);
});
