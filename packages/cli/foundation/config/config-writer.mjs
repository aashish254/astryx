// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Write one string field of a project's astryx.config.
 *
 * Edits the default-exported object literal in place (comments and other
 * fields kept), or creates `astryx.config.mjs` when the project has no
 * config. A config whose default export is not a static object literal is
 * refused rather than rewritten.
 *
 * @input A project directory, a field name, and its string value
 * @output The config file written and the value it replaced
 * @position packages/cli/foundation/config — read by `astryx icon use`
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {randomUUID} from 'node:crypto';
import jscodeshift from 'jscodeshift';
import {findManifestObject} from '../integrations/manifest-writer.mjs';
import {CONFIG_BASENAMES} from './project.mjs';

/** @param {any} property @param {string} name */
function propertyNamed(property, name) {
  if (
    !property ||
    !['ObjectProperty', 'Property'].includes(property.type) ||
    property.computed
  ) {
    return false;
  }
  return (
    (property.key?.type === 'Identifier' && property.key.name === name) ||
    (['Literal', 'StringLiteral'].includes(property.key?.type) &&
      property.key.value === name)
  );
}

/**
 * Set `key` to `value` in the project's astryx.config.
 * @param {string} projectDir
 * @param {string} key
 * @param {string} value
 * @returns {{file: string, created: boolean, previous: string | null, changed: boolean}}
 */
export function setConfigString(projectDir, key, value) {
  const existing = CONFIG_BASENAMES.map(name =>
    path.join(projectDir, name),
  ).find(file => fs.existsSync(file));
  if (!existing) {
    const file = path.join(projectDir, 'astryx.config.mjs');
    writeAtomically(
      file,
      `export default {\n  ${key}: ${JSON.stringify(value).replace(/^"|"$/gu, "'")},\n};\n`,
    );
    return {file, created: true, previous: null, changed: true};
  }
  const source = fs.readFileSync(existing, 'utf-8');
  const j = jscodeshift.withParser('tsx');
  const ast = j(source);
  const object = findManifestObject(j, ast);
  if (!object) {
    throw new Error(
      `Could not update ${path.basename(existing)} safely: its default export is not a static object literal. Set "${key}: '${value}'" in it yourself.`,
    );
  }
  const property = object.properties.find((/** @type {any} */ each) =>
    propertyNamed(each, key),
  );
  /** @type {string | null} */
  let previous = null;
  if (property) {
    const current = property.value;
    previous =
      current?.type === 'StringLiteral' || current?.type === 'Literal'
        ? String(current.value)
        : null;
    if (previous === value) {
      return {file: existing, created: false, previous, changed: false};
    }
    property.value = j.stringLiteral(value);
  } else {
    object.properties.push(
      j.objectProperty(j.identifier(key), j.stringLiteral(value)),
    );
  }
  let next = ast.toSource({quote: 'single', reuseWhitespace: true});
  if (source.endsWith('\n') && !next.endsWith('\n')) next += '\n';
  writeAtomically(existing, next);
  return {file: existing, created: false, previous, changed: true};
}

/**
 * @param {string} file
 * @param {string} text
 */
function writeAtomically(file, text) {
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.tmp-${randomUUID()}`,
  );
  try {
    fs.writeFileSync(temporary, text, 'utf-8');
    fs.renameSync(temporary, file);
  } catch (error) {
    fs.rmSync(temporary, {force: true});
    throw error;
  }
}
