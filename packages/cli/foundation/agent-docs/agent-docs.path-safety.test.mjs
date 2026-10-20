// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Path-safety regression tests for agent-doc writes.
 *
 * `installAgentDocs(targetDir, {paths})` previously joined each path
 * onto `targetDir` with no validation, so:
 *   - `../OUT.md` wrote outside `targetDir`
 *   - `/tmp/x.md` was silently re-rooted under `targetDir`
 *
 * Auto-detected and preset files were never checked at all, so a `CLAUDE.md`
 * or `.claude/` symlinked out of the project had the block written through
 * it. Every case now throws PathSafetyError before any file is touched. A file
 * only the current layout writes (GEMINI.md) that links outside is skipped and
 * reported instead, and the rest is written, so init keeps 0.7.0's exit code.
 *
 * `removeAgentDocs` (`init --remove-agents`) stripped or deleted a block
 * through the same kind of link and reported success. It now refuses with
 * `ERR_PATH_TRAVERSAL` before any file is touched.
 */

import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  installAgentDocs,
  removeAgentDocs,
  removeXdsBlock,
} from './agent-docs.mjs';
import {PathSafetyError} from '../fs/path-safety.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';

const BLOCK = '<!-- ASTRYX:START -->\nmanaged\n<!-- ASTRYX:END -->';

let tmpDir;
beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-agent-docs-paths-'));
});
afterEach(() => {
  fs.rmSync(tmpDir, {recursive: true, force: true});
});

/** A project dir plus a sibling dir outside it. */
function layout() {
  const project = path.join(tmpDir, 'project');
  const outside = path.join(tmpDir, 'outside');
  fs.mkdirSync(project, {recursive: true});
  fs.mkdirSync(outside, {recursive: true});
  return {project, outside};
}

/**
 * @param {() => unknown} fn
 * @returns {unknown} what `fn` threw
 */
function thrownBy(fn) {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected a throw');
}

describe('installAgentDocs path safety', () => {
  it('rejects --agent-docs-path that escapes the target directory', () => {
    const target = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(target, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});

    expect(() => installAgentDocs(target, {paths: ['../OUT.md']})).toThrow(
      PathSafetyError,
    );

    expect(fs.existsSync(path.join(tmpDir, 'OUT.md'))).toBe(false);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('rejects an absolute --agent-docs-path with a clear error', () => {
    const target = path.join(tmpDir, 'project');
    fs.mkdirSync(target, {recursive: true});
    const absPath = path.join(tmpDir, 'absolute.md');

    expect(() => installAgentDocs(target, {paths: [absPath]})).toThrow(
      /absolute paths are not allowed/i,
    );

    expect(fs.existsSync(absPath)).toBe(false);
  });

  it('rejects deeper traversal segments', () => {
    const target = path.join(tmpDir, 'a', 'b', 'c');
    fs.mkdirSync(target, {recursive: true});

    expect(() =>
      installAgentDocs(target, {paths: ['../../../escaped.md']}),
    ).toThrow(PathSafetyError);

    expect(fs.existsSync(path.join(tmpDir, 'escaped.md'))).toBe(false);
  });
});

describe('installAgentDocs never writes through a symlink out of the project', () => {
  it('refuses an auto-detected file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      /outside the project root/,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
    expect(fs.readdirSync(project)).toEqual(['CLAUDE.md']);
  });

  it('skips a GEMINI.md that links outside, reports it, and writes the rest', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'GEMINI.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'GEMINI.md'));
    /** @type {Array<[string, string]>} */
    const skipped = [];

    expect(
      installAgentDocs(project, {
        renderedBlock: BLOCK,
        onSkipped: (rel, reason) => skipped.push([rel, reason]),
      }),
    ).toEqual(['AGENTS.md']);
    expect(skipped).toEqual([
      ['GEMINI.md', expect.stringMatching(/outside the project root/)],
    ]);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  });

  it('leaves a .claude folder that links outside alone when root CLAUDE.md holds the copy', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readdirSync(outside)).toEqual([]);

    // A CLAUDE.md in the linked folder with no block is not written either.
    fs.writeFileSync(path.join(outside, 'CLAUDE.md'), '# Shared\n');
    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(path.join(outside, 'CLAUDE.md'), 'utf-8')).toBe(
      '# Shared\n',
    );
  });

  it('refuses a preset file reached through a symlinked directory', () => {
    const {project, outside} = layout();
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(() =>
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readdirSync(outside)).toEqual([]);
  });

  it('refuses an existing preset file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    expect(() =>
      installAgentDocs(project, {agent: 'cursor', renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('writes nothing when any file of the set escapes', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      PathSafetyError,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  });

  it('refuses to refresh a managed block that lives outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(
      shared,
      `# Shared\n\n${BLOCK.replace('managed', 'old')}\n`,
    );
    const before = fs.readFileSync(shared, 'utf-8');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() =>
      installAgentDocs(project, {onlyReplace: true, renderedBlock: BLOCK}),
    ).toThrow(PathSafetyError);
    expect(fs.readFileSync(shared, 'utf-8')).toBe(before);
  });

  it('refuses to strip a duplicate block from a wrapper that links outside', () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), `# Agents\n\n${BLOCK}\n`);
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `@AGENTS.md\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      PathSafetyError,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`@AGENTS.md\n\n${BLOCK}\n`);
  });

  it('still refreshes in-project blocks beside an unmarked outside link it skips', () => {
    const {project, outside} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\n${BLOCK.replace('managed', 'old')}\n`,
    );
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    expect(
      installAgentDocs(project, {onlyReplace: true, renderedBlock: BLOCK}),
    ).toEqual(['AGENTS.md']);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toContain(
      'managed',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('writes through a symlink that stays inside the project', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '# Agents\n');
    fs.symlinkSync('AGENTS.md', path.join(project, 'CLAUDE.md'));

    // CLAUDE.md is AGENTS.md under another name, so it already has the block.
    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'GEMINI.md',
    ]);
    const content = fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8');
    expect(content.split('<!-- ASTRYX:START -->')).toHaveLength(2);
  });
});

describe('init --features agents with an agent doc linked outside the project', () => {
  it('writes nothing outside, reports path-safety, and exits 1 in both modes', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(project, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(1);
    const env = JSON.parse(json.stdout);
    expect(env.type).toBe('init.run');
    expect(env.data.docsError).toMatchObject({kind: 'path-safety'});

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(1);

    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);

  it('a GEMINI.md linked outside is skipped and reported, and init exits 0', async () => {
    const project = path.join(tmpDir, 'project');
    const outside = path.join(tmpDir, 'outside');
    fs.mkdirSync(project, {recursive: true});
    fs.mkdirSync(outside, {recursive: true});
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'GEMINI.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'GEMINI.md'));

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(0);
    const env = JSON.parse(json.stdout);
    expect(env.data.docsWritten).toEqual(['AGENTS.md']);
    expect(env.data.docsError).toEqual({
      kind: 'install-failed',
      message: expect.stringMatching(
        /^Left as it is: GEMINI\.md \(.*outside the project root/,
      ),
    });

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    expect(text.stderr).toMatch(/^Note: Left as it is: GEMINI\.md/m);
    expect(text.stderr).not.toMatch(/Error:/);

    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);
});

describe('removeAgentDocs never changes a file out of the project', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refuses to strip a block from a file that links outside', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `# Shared\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const err = thrownBy(() => removeAgentDocs(project));
    expect(err).toBeInstanceOf(PathSafetyError);
    expect(err).toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`# Shared\n\n${BLOCK}\n`);
  });

  it('refuses to delete a file reached through a symlinked directory', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    const content = `# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n${BLOCK}\n`;
    fs.writeFileSync(shared, content);
    fs.symlinkSync(outside, path.join(project, '.claude'));

    expect(thrownBy(() => removeAgentDocs(project))).toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    expect(fs.readFileSync(shared, 'utf-8')).toBe(content);
  });

  it('changes nothing when any file of the set escapes', () => {
    const {project, outside} = layout();
    const agents = `# Agents\n\nkeep\n\n${BLOCK}\n`;
    fs.writeFileSync(path.join(project, 'AGENTS.md'), agents);
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `# Shared\n\n${BLOCK}\n`);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    expect(thrownBy(() => removeAgentDocs(project))).toBeInstanceOf(
      PathSafetyError,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      agents,
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`# Shared\n\n${BLOCK}\n`);
  });

  it('still strips in-project blocks beside an unmarked outside link it skips', () => {
    const {project, outside} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\nkeep\n\n${BLOCK}\n`,
    );
    const shared = path.join(outside, 'rules');
    fs.writeFileSync(shared, 'rules\n');
    fs.symlinkSync(shared, path.join(project, '.cursorrules'));

    removeAgentDocs(project);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n\nkeep\n',
    );
    expect(fs.readFileSync(shared, 'utf-8')).toBe('rules\n');
  });

  it('strips through a symlink that stays inside the project', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'AGENTS.md'),
      `# Agents\n\nkeep\n\n${BLOCK}\n`,
    );
    fs.symlinkSync('AGENTS.md', path.join(project, 'CLAUDE.md'));

    removeAgentDocs(project);
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '# Agents\n\nkeep\n',
    );
  });
});

describe('init --remove-agents with an agent doc linked outside the project', () => {
  it('changes nothing outside, fails with ERR_PATH_TRAVERSAL, and exits 1 in both modes', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    const content = `# Shared\n\n${BLOCK}\n`;
    fs.writeFileSync(shared, content);
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const json = await runCli(['init', '--remove-agents', '--json'], project);
    expect(json.status).toBe(1);
    const env = JSON.parse(json.stdout);
    expect(env).toMatchObject({apiVersion: 1, code: 'ERR_PATH_TRAVERSAL'});
    expect(env.error).toMatch(
      /"CLAUDE\.md": resolves outside the project root/,
    );
    expect(env).not.toHaveProperty('data');

    const text = await runCli(['init', '--remove-agents'], project);
    expect(text.status).toBe(1);
    expect(text.stderr).toMatch(
      /^Error: .*"CLAUDE\.md": resolves outside the project root/m,
    );
    expect(text.stdout).not.toMatch(/removed/i);

    expect(fs.readFileSync(shared, 'utf-8')).toBe(content);
  }, 30_000);
});

describe("existing Claude files and GEMINI.md take upgrade's protections (spec:AST-040 FR2)", () => {
  /** @param {string} project @param {object} [options] */
  const run = (project, options = {}) => {
    /** @type {Array<[string, string]>} */
    const skipped = [];
    const written = installAgentDocs(project, {
      renderedBlock: BLOCK,
      onSkipped: (rel, reason) => skipped.push([rel, reason]),
      ...options,
    });
    return {written, skipped};
  };
  const OLD_BLOCK = '<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->';
  const INIT_HEADING = (/** @type {string} */ name) =>
    `# ${name}\n\nProject-specific guidance for AI coding agents.`;

  it('creates AGENTS.md and the GEMINI.md import even when ignore rules cover them (INV31)', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, '.gitignore'),
      'AGENTS.md\nGEMINI.md\n',
    );

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(skipped).toEqual([]);
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toContain(
      '@./AGENTS.md',
    );
  });

  it('leaves an existing GEMINI.md the project ignores as it is, and reports it', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), 'GEMINI.md\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# My Gemini notes\n');

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md']);
    expect(skipped).toEqual([
      [
        'GEMINI.md',
        expect.stringMatching(/^protected by excluded by \.gitignore/u),
      ],
    ]);
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toBe(
      '# My Gemini notes\n',
    );
  });

  it('leaves a generated GEMINI.md as it is', () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'GEMINI.md'),
      '<!-- @generated by tool -->\n# Gemini\n',
    );

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md']);
    expect(skipped.map(([rel]) => rel)).toEqual(['GEMINI.md']);
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toBe(
      '<!-- @generated by tool -->\n# Gemini\n',
    );
  });

  it("leaves an ignored .claude/CLAUDE.md with the user's text as it is, and creates nothing beside it", () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '.claude/\n');
    fs.mkdirSync(path.join(project, '.claude'));
    fs.writeFileSync(path.join(project, '.claude', 'CLAUDE.md'), '# Mine\n');

    const {written, skipped} = run(project);

    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(skipped.map(([rel]) => rel)).toEqual(['.claude/CLAUDE.md']);
    expect(
      fs.readFileSync(path.join(project, '.claude', 'CLAUDE.md'), 'utf-8'),
    ).toBe('# Mine\n');
    expect(fs.readdirSync(path.join(project, '.claude'))).toEqual([
      'CLAUDE.md',
    ]);
  });

  it("refreshes an ignored .claude/CLAUDE.md that holds only init's own output, as init regenerates its output (AST-040 FR5)", () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, '.gitignore'),
      'AGENTS.md\nGEMINI.md\n.claude/CLAUDE.md\n',
    );
    fs.mkdirSync(path.join(project, '.claude'));
    const claude = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(claude, `${INIT_HEADING('CLAUDE')}\n\n${OLD_BLOCK}\n`);

    const {written, skipped} = run(project);

    expect(skipped).toEqual([]);
    expect(written).toEqual(['AGENTS.md', '.claude/CLAUDE.md', 'GEMINI.md']);
    expect(fs.readFileSync(claude, 'utf-8')).toBe(
      `${INIT_HEADING('CLAUDE')}\n\n${BLOCK}\n`,
    );
  });

  it('still leaves a linked .claude/CLAUDE.md alone, even when it holds only init output', () => {
    const {project, outside} = layout();
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, `${OLD_BLOCK}\n`);
    fs.mkdirSync(path.join(project, '.claude'));
    fs.symlinkSync(shared, path.join(project, '.claude', 'CLAUDE.md'));

    expect(() => run(project)).toThrow(/outside the project root/u);
    expect(fs.readFileSync(shared, 'utf-8')).toBe(`${OLD_BLOCK}\n`);
  });

  it('--agent claude creates .claude/CLAUDE.md as its option says, even in an ignored .claude', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '.claude/\n');

    const {written, skipped} = run(project, {agent: 'claude'});

    expect(written).toEqual(['.claude/CLAUDE.md']);
    expect(skipped).toEqual([]);
    expect(
      fs.readFileSync(path.join(project, '.claude', 'CLAUDE.md'), 'utf-8'),
    ).toContain(BLOCK);
  });

  it('keeps the .claude/CLAUDE.md copy when root CLAUDE.md is left as it is', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, '.gitignore'), '/CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Mine\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const copy = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(copy, `${BLOCK}\n`);

    const {written, skipped} = run(project);

    expect(skipped.map(([rel]) => rel)).toEqual(['CLAUDE.md']);
    expect(written).toEqual(['AGENTS.md', 'GEMINI.md']);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`${BLOCK}\n`);
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toBe(
      '# Mine\n',
    );

    // --agent claude keeps it too.
    const preset = run(project, {agent: 'claude'});
    expect(preset.skipped.map(([rel]) => rel)).toEqual(['CLAUDE.md']);
    expect(fs.readFileSync(copy, 'utf-8')).toBe(`${BLOCK}\n`);
  });

  it('creates the .claude folder for --agent claude when nothing protects it', () => {
    const {project} = layout();

    expect(
      installAgentDocs(project, {agent: 'claude', renderedBlock: BLOCK}),
    ).toEqual(['.claude/CLAUDE.md']);
    expect(fs.existsSync(path.join(project, '.claude', 'CLAUDE.md'))).toBe(
      true,
    );
  });
});

describe('a project with its own layout (INV31)', () => {
  it('gives a standalone GEMINI.md that imports no agent file a copy', () => {
    const {project} = layout();
    // AGENTS.md imports CLAUDE.md, so the project keeps its own layout.
    fs.writeFileSync(path.join(project, 'AGENTS.md'), '@CLAUDE.md\n');
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# Gemini\n');

    const written = installAgentDocs(project, {renderedBlock: BLOCK});

    expect(written).toContain('GEMINI.md');
    expect(fs.readFileSync(path.join(project, 'GEMINI.md'), 'utf-8')).toContain(
      BLOCK,
    );
    expect(fs.readFileSync(path.join(project, 'AGENTS.md'), 'utf-8')).toBe(
      '@CLAUDE.md\n',
    );
  });
});

describe('init exit codes and output for files left as they are', () => {
  it('a protected file: exit 0, docsError, and one note on stderr, no Error line', async () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    fs.writeFileSync(path.join(project, '.gitignore'), 'GEMINI.md\n');
    fs.writeFileSync(path.join(project, 'GEMINI.md'), '# My Gemini notes\n');

    const json = await runCli(
      ['init', '--features', 'agents', '--json'],
      project,
    );
    expect(json.status).toBe(0);
    expect(JSON.parse(json.stdout).data.docsError).toEqual({
      kind: 'install-failed',
      message: expect.stringMatching(
        /^Left as it is: GEMINI\.md \(protected by excluded by \.gitignore/u,
      ),
    });

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(0);
    const lines = text.stderr.split('\n').filter(Boolean);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Note: Left as it is: GEMINI\.md/u);
    expect(text.stderr).not.toMatch(/Error:/u);
  }, 30_000);

  it('a path that escapes the project still exits 1, as in 0.7.1', async () => {
    const {project, outside} = layout();
    fs.writeFileSync(path.join(project, 'package.json'), '{"name":"app"}\n');
    const shared = path.join(outside, 'CLAUDE.md');
    fs.writeFileSync(shared, '# Shared\n');
    fs.symlinkSync(shared, path.join(project, 'CLAUDE.md'));

    const text = await runCli(['init', '--features', 'agents'], project);
    expect(text.status).toBe(1);
    expect(fs.readFileSync(shared, 'utf-8')).toBe('# Shared\n');
  }, 30_000);
});

describe("the sandbox app's postinstall stays quiet", () => {
  // apps/sandbox runs `astryx init --features agents` on every install, and its
  // .gitignore lists the files init writes there.
  const sandboxIgnore = fs.readFileSync(
    new URL('../../../../apps/sandbox/.gitignore', import.meta.url),
    'utf-8',
  );

  it('prints nothing on stderr on a fresh install, a second install, or with an old .claude/CLAUDE.md init wrote', async () => {
    const {project} = layout();
    fs.writeFileSync(
      path.join(project, 'package.json'),
      '{"name":"sandbox"}\n',
    );
    fs.writeFileSync(path.join(project, '.gitignore'), sandboxIgnore);

    for (let round = 0; round < 2; round++) {
      const r = await runCli(['init', '--features', 'agents'], project);
      expect(r.status, `round ${round}`).toBe(0);
      expect(r.stderr, `round ${round}`).toBe('');
    }

    // A dev machine where an older init created .claude/CLAUDE.md.
    fs.mkdirSync(path.join(project, '.claude'), {recursive: true});
    const claude = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      claude,
      '# CLAUDE\n\nProject-specific guidance for AI coding agents.\n\n<!-- ASTRYX:START -->\nold\n<!-- ASTRYX:END -->\n',
    );
    const r = await runCli(['init', '--features', 'agents'], project);
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    expect(fs.readFileSync(claude, 'utf-8')).not.toContain('\nold\n');
  }, 60_000);
});

describe('removing the copy in .claude/CLAUDE.md', () => {
  it('removes only the managed block, keeps the user text, and only once root CLAUDE.md holds the same block', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(
      dirFile,
      `# My notes\nKeep this guidance.\n\n${BLOCK}\n\nAnd this.\n`,
    );

    expect(installAgentDocs(project, {renderedBlock: BLOCK})).toEqual([
      'AGENTS.md',
      'CLAUDE.md',
      '.claude/CLAUDE.md',
      'GEMINI.md',
    ]);
    expect(fs.readFileSync(dirFile, 'utf-8').trimEnd()).toBe(
      '# My notes\nKeep this guidance.\n\nAnd this.',
    );
    expect(fs.readFileSync(path.join(project, 'CLAUDE.md'), 'utf-8')).toContain(
      BLOCK,
    );
  });

  it('keeps the copy when root CLAUDE.md does not end up holding the same block', () => {
    const {project} = layout();
    // A root CLAUDE.md with a malformed block is refused before any write, so
    // the copy in .claude/CLAUDE.md stays where it is.
    fs.writeFileSync(
      path.join(project, 'CLAUDE.md'),
      '<!-- ASTRYX:START -->\nbroken\n',
    );
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(dirFile, `${BLOCK}\n`);

    expect(() => installAgentDocs(project, {renderedBlock: BLOCK})).toThrow(
      /Malformed/u,
    );
    expect(fs.readFileSync(dirFile, 'utf-8')).toBe(`${BLOCK}\n`);
  });

  it('deletes .claude/CLAUDE.md only when nothing but whitespace is left', () => {
    const {project} = layout();
    fs.writeFileSync(path.join(project, 'CLAUDE.md'), '# Claude\n');
    fs.mkdirSync(path.join(project, '.claude'));
    const dirFile = path.join(project, '.claude', 'CLAUDE.md');
    fs.writeFileSync(dirFile, `\n\n${BLOCK}\n  \n`);

    installAgentDocs(project, {renderedBlock: BLOCK});

    expect(fs.existsSync(dirFile)).toBe(false);
  });
});

describe('removeXdsBlock deletes only a file init created', () => {
  it('keeps a file whose own text mentions guidance (the 0.7.0 heading match deleted it)', () => {
    const {project} = layout();
    const file = path.join(project, 'AGENTS.md');
    fs.writeFileSync(
      file,
      `# Team rules\nOur guidance for reviewers.\n\n${BLOCK}\n`,
    );

    expect(removeXdsBlock(file, {deleteIfEmpty: true})).toBe(true);
    expect(fs.readFileSync(file, 'utf-8')).toBe(
      '# Team rules\nOur guidance for reviewers.\n',
    );
  });

  it('deletes a file that holds only the heading init writes', () => {
    const {project} = layout();
    const file = path.join(project, 'AGENTS.md');
    fs.writeFileSync(
      file,
      `# AGENTS.md\n\nProject-specific guidance for AI coding agents.\n\n${BLOCK}\n`,
    );

    expect(removeXdsBlock(file, {deleteIfEmpty: true})).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
  });
});
