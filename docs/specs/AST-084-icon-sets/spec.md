---
schema_version: 4
template_version: 2
kind: system-spec
id: spec:AST-084
authority: draft
archive_reason: null
superseded_by: null
approved_by: null
approved_at: null
phase: proposed
owners: [josephfarina]
affects_architecture: [architecture:cli-surface]
affects_families: []
affects_contributing: [contributing:cli-conventions]
affects_consumer_docs: [cli/integrations, icons, template-icons]
---

# Icon set integrations system spec

<!-- Describe the system, not the project: present tense, what it does. No proposals, history, pull requests, or research in the record; see docs/contributing/spec-writing.md and report its rubric results in the pull request. -->

## Intent

An icon set is an integration item: a package of icon components plus one data
file that says what every icon means. Astryx owns a list of icon definitions,
one file per thing an icon can stand for (`close`, `delete`, `rocket`); a set's
data file maps each definition it supports to one of its icons. With an icon set installed:

- an agent or engineer finds an icon by meaning (`astryx icon trash`,
  `astryx search delete`) and gets the exact import line;
- a template or block copied into the project uses the installed set's icons
  instead of the icons the template was written with; and
- a theme points the shared semantic icon names (`close`, `search`,
  `chevronDown`, …) at the set's artwork.

All three read the same data file. The CLI writes it, one verified icon at a
time or a whole library at once, and checks it against what the package
actually exports. The CLI knows no icon library: the author, or the author's
agent, picks each icon, and templates declare which definition each of their
icons draws.

An icon library that ships no data file takes part through a thin wrapper
package. A wrapper re-exports the library's icons as named, tree-shakeable
exports and adds the data file, the theme map, and the library's license
notices. An app imports some icons or all of them; templates work with whichever
set is installed.

## Non-goals

- Choose icon artwork at render time by appearance, weight, or size. Runtime
  presentation belongs to the Icon component contract and
  `architecture:icon-resolution-and-component-slots`; this spec only describes
  which variants a set supplies.
- Grow the shared `IconName` set. The built-in icon definitions are exactly
  the `IconName` values; a set maps them and never adds one.
- Make each icon a separate discoverable item with its own descriptor. The icon
  set is the item; its icons are that item's data.
- Edit, redraw, or synthesize artwork. Every icon is a component the package
  exports.
- Equivalent internal implementations remain valid when they satisfy this
  contract.

## Requirements

### What an icon set declares

- **FR1 — An integration locates its icon sets with one root.** The integration
  manifest MAY set `iconSets`, a relative path to a directory. Each lower-kebab
  directory under it is one icon set, named by the directory. The manifest never
  lists the sets or their icons (`spec:AST-039/FR11`).
- **FR2 — Each set has one typed descriptor.** The set's directory MUST contain
  `<name>.doc.mjs`, a default-exported `IconSetDoc` annotated with its type from
  `@astryxdesign/cli/authoring`:

  ```js
  /** @type {import('@astryxdesign/cli/authoring').IconSetDoc} */
  export default {
    type: 'icon-set',
    name: 'glyph',
    displayName: 'Glyph',
    description: 'Outline icons with rounded strokes.',
    maintained: true,
    license: 'ISC',
  };
  ```

  `name` MUST equal the directory name. `license` is an SPDX expression for the
  artwork. The descriptor holds only what a person writes about the set; it
  never lists icons. `astryx integration add icon-set <name>` writes a new set
  the way it writes every other kind (`spec:AST-039`): the descriptor, a
  data file whose `module` is the package's own name and whose icon list is
  empty, the `iconSets` root on first use, and the root in an existing
  package.json `files` list. It never overwrites a file, and a write that
  fails is rolled back.

- **FR3 — Each set has one data file, and every icon surface reads it.** The
  set's directory MUST contain `<name>.icons.json`. Search, the icon lookup
  command, template icon mapping, the theme map check, and Doctor read this file
  and the set's definitions folder, and nothing else, to learn what icons exist
  and what they mean. Its shape:

  ```json
  {
    "schemaVersion": 1,
    "module": "@acme/glyph-icons",
    "source": {"package": "@acme/glyph-library", "version": "1.60.0"},
    "generated": "./icon-sets/glyph/glyph.generated.js",
    "adapter": {"module": "./src/adapt.js", "export": "adapt"},
    "axes": {
      "appearances": ["outline", "solid"],
      "sizes": [20, 24],
      "weights": {"range": {"min": 0.5, "max": 3}}
    },
    "default": {"appearance": "outline", "size": 24, "weight": 2},
    "themeMap": "themeIcons",
    "map": {"close": "x", "delete": "trash"},
    "icons": [
      {
        "id": "x",
        "export": "XIcon",
        "words": ["x", "close", "cancel", "dismiss"],
        "matches": [
          {"set": "lines", "export": "CrossIcon", "confidence": "exact"}
        ]
      },
      {
        "id": "trash",
        "export": "TrashIcon",
        "words": ["trash", "delete", "remove", "bin"],
        "variants": [
          {"appearance": "solid", "size": 20, "export": "TrashSolid20Icon"}
        ]
      }
    ]
  }
  ```

  - `module` is the import specifier every `export` is read from: the set's
    own package name or one of its package.json `exports` subpaths (FR19).
  - `source` names the upstream library and version the file was generated
    from. It is absent for a set with no upstream.
  - `generated` is the module `astryx icon add` writes (FR18), and `adapter`
    the function in the package that turns a library export that is not a
    component into one. Both are `./` paths from the package root.
  - `axes` lists the appearances, sizes (in pixels), and weights the set
    supplies. `weights` is either `{"values": [...]}` or `{"range": {min, max}}`.
    Every axis is optional; a set that varies on nothing omits `axes`.
  - `default` is the variant an icon's own `export` draws. When the set offers
    an outline appearance, it is the default (`design:iconography` DR5).
  - `map` maps an icon definition (FR3a) to the `id` of the icon that draws
    it. One icon MAY draw several definitions.
  - Each icon has a lower-kebab `id`, unique in the set; the `export` that draws
    its default variant; `words`, the lower-case terms a person might search
    for, the words of its own name included, at least one; optional
    `variants`, each naming its axis values and its own `export`; and
    optional `matches`, reviewed equivalents of the icon in other sets.
  - Each match names another installed set (`set`, never the set's own
    name), that set's `export`, optionally the `variant` (an appearance) of
    that set it names, and a `confidence` of `exact`, `strong`, or `likely`.
    A match without a `variant` names every variant of that export. One icon
    lists a match at most once.
  - `themeMap` names the export that maps each built-in definition in `map`
    to its artwork (FR13).

  A data file that fails this shape, repeats an `id`, gives an icon no words,
  has a `map` key that is neither an Astryx definition nor one of the set's
  own, or a `map` value that is not an icon `id`, names an axis value `axes`
  does not list, gives a match an unknown confidence, or has a match that
  names its own set is invalid. So is a set whose definition file is invalid.

- **FR3a — Icon definitions are typed doc files in a folder.** An icon
  definition is an `IconDefinitionDoc` (`type: 'icon-definition'`) with a
  camelCase `name`, a one-sentence `description`, at least one search word in
  `words`, and `builtIn: true` exactly when it is a shared `IconName`. Astryx
  ships one `<name>.doc.mjs` per definition in the CLI's icon definitions
  folder; a set adds its own as `<set directory>/definitions/<name>.doc.mjs`.
  Discovery reads every file in the folder, statically; there is no index.
  A set's own definition needs no change to Astryx and maps only within that
  set. When a set's definition has the name of an Astryx one, Astryx's wins.
  The `icon-definitions` docs namespace adopts every definition, Astryx's and
  each installed set's, so `astryx docs icon-definitions` lists them and
  search finds each one.

- **FR4 — The data comes from the source, written once.** When the upstream
  library publishes per-icon names or tags, the set's data file is generated from
  them, and regenerating it from the same upstream version produces the same
  file. Words the upstream does not publish are written once in the wrapper's
  own source, never in a second copy of the data. A set with no upstream authors
  its data file directly.
- **FR5 — The directory is the set's boundary.** The set's directory holds its
  descriptor, data file, and any license notice files. Packing and copying take
  the whole directory, and discovery rejects a path in the data file that
  escapes the package (`spec:AST-039/FR5`). Discovery reads the descriptor and
  the data file; it never executes the icon module (`spec:AST-039/FR6`).

### Finding an icon by meaning

- **FR6 — `astryx icon` looks up icons by meaning.** `astryx icon <words>`
  MUST search every installed set's data file and answer `icon.search`:

  ```json
  {
    "apiVersion": 1,
    "type": "icon.search",
    "data": {
      "query": "delete",
      "matchCount": 3,
      "matches": [
        {
          "set": "glyph",
          "id": "trash",
          "package": "@acme/glyph-icons",
          "module": "@acme/glyph-icons",
          "export": "TrashIcon",
          "import": "import {TrashIcon} from '@acme/glyph-icons';",
          "words": ["trash", "delete", "remove", "bin"],
          "definitions": ["delete"],
          "variants": [],
          "reason": "word \"delete\"",
          "score": 90
        }
      ]
    }
  }
  ```

  Matches rank in these tiers, each with its `score` and `reason`:

  | Score | The query, lower-cased and trimmed                                                                                                         | `reason`                              |
  | ----- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
  | 100   | equals an icon definition the set's `map` names the icon for, ignoring case, spaces, `-`, and `_`                                          | `definition "<name>"`                 |
  | 90    | is an exact match in the leading reading (below)                                                                                           | `id "<id>"` or `word "<word>"`        |
  | 80    | is an exact match in the other reading                                                                                                     | `id "<id>"` or `word "<word>"`        |
  | 60    | starts one of its `words`                                                                                                                  | `word "<word>" starts with "<query>"` |
  | 40    | is inside its `id` or one of its `words`, or, for a query of several words, every query word starts a part of its `id` or one of its words | `partial "<text>"`                    |

  An exact match is a name match or a meaning match. It is a name match when
  the query equals the icon's `id` (spaces read as `-`, reason `id "<id>"`)
  or one of its `words` that is also a part of the `id` (`trash` for
  `trash-2`). It is a meaning match when the query equals one of its other
  `words`, its tags. Across the searched sets, when at least as many icons
  have a meaning match as have a name match, meaning matches score 90 and
  name matches 80; otherwise name matches score 90 and meaning matches 80.
  Within one score, a match on a whole `id` comes before a match on a part of
  one, and a meaning match comes before another when the query is earlier
  among the icon's tags.

  Remaining ties keep the set order (FR10) and then `id` order, so the same
  installation always answers the same way. `--set <name>` keeps one set.
  `--limit <n>` caps the list (default 10); `matchCount` counts every match. A
  query with no match answers an empty list, not an error.

- **FR7 — One icon and the installed sets have their own reads.**
  `astryx icon <set>/<id>` answers `icon.detail` with the same fields as a match
  plus every variant's import line, and fails with `ERR_NOT_FOUND` with
  suggestions when the set or icon does not exist. `<set>` is a set name or
  `<package>/<set>`; when two installed packages ship a set with one name, the
  bare name fails with `ERR_INVALID_ARGUMENT` and suggests each qualified form.
  `--set` takes the same two forms. `astryx icon --list` answers
  `icon.list`: each installed set with its `name`, `displayName`, `package`,
  `license`, icon count, `default`, `axes`, and its `coverage`: built-in
  definitions mapped of all and the ones missing, Astryx definitions mapped
  of all, and the set's own definitions; the project's icon-set state; and
  each withdrawn set with its reason. Every response names its `package` (`architecture:cli-surface`
  INV28).
- **FR8 — `astryx search` finds icons too.** `astryx search <words>` MUST
  include icon matches under the domain `icon`, with `name` as `<set>/<id>`,
  `import`, `package`, and `command` set to `astryx icon <set>/<id>`. An icon
  match ranks below a component or doc match of equal score, so a word such as
  `table` still finds the Table component first. `--type icon` keeps only icons.
- **FR9 — Only installed sets answer.** A set answers searches and lookups only
  when its integration loads in the project and its `module` resolves from the
  project. A set whose data file is invalid is withdrawn from every surface, and
  Doctor reports it (FR15).

### Templates and blocks use the installed set

- **FR10 — One set is the project's icon set.** The project's icon set is the
  set named by the `iconSet` field of `astryx.config` (`"<set>"` or
  `"<package>/<set>"`); otherwise the only installed set; otherwise none. With
  two or more installed sets and no `iconSet`, the project has no icon set, and
  Doctor warns (FR15). An `iconSet` written as `"<set>"` that two installed
  packages both ship names no set: the project has no icon set and Doctor
  warns, naming the qualified form. The set order for search ties is the project's icon set
  first, then the integration load order.
- **FR11 — A template maps icons by icon definition.** A template or block
  declares, in its descriptor's `icons`, the icon definition each icon it
  imports draws, by imported name (`icons: {TrashIcon: 'delete'}`); an
  integration template MAY declare the same field. When the project has an
  icon set, `astryx template <name>` (printed or copied to a path) and
  `astryx build` rewrite each declared icon import, and each import of an
  icon another installed set ships (which draws the Astryx definitions that
  set's `map` names it for). Each icon maps to the project set's icon that:
  1. names it in `matches` with `exact` or `strong` confidence, ties broken by
     confidence and then `id` (for an icon an installed set ships);
  2. otherwise is the icon the project set's `map` names for the definition
     the icon draws.

  Nothing is guessed from names or words, and a `likely` match is never
  applied. An import no descriptor declares and no installed set ships is not
  an icon and is left alone.

  The import, and every reference to the imported name in the file, use the
  mapped export. When the source icon names a variant (for example a solid
  appearance), the mapped icon uses the variant with the same appearance if it
  has one, else its default. A name that would collide with another binding in
  the file is imported under an alias.

- **FR12 — A missing icon keeps the template's icon and says so.** An icon with
  no match keeps its original import, and the original library stays a needed
  dependency of the source. The JSON result, and the copy receipt, report every
  icon as `mapped` (with source and target) or `kept` under `icons`, so the
  caller sees exactly what changed; printed source keeps stdout to the source
  and reports the same on stderr (`architecture:cli-surface` INV28). The report
  is:

  ```json
  {
    "status": "selected",
    "set": "@acme/glyph-icons/glyph",
    "reason": "\"@acme/glyph-icons/glyph\" is the only installed icon set.",
    "mapped": [
      {
        "source": {
          "module": "@acme/other-library",
          "export": "CloseGlyph"
        },
        "target": {
          "set": "glyph",
          "package": "@acme/glyph-icons",
          "id": "x",
          "module": "@acme/glyph-icons",
          "export": "XIcon"
        },
        "by": "definition"
      }
    ],
    "kept": [
      {
        "module": "@acme/lines",
        "export": "ClipIcon",
        "reason": "…",
        "suggestion": {
          "set": "glyph",
          "id": "paperclip",
          "module": "@acme/glyph-icons",
          "export": "PaperclipIcon",
          "confidence": "likely"
        }
      }
    ]
  }
  ```

  `status` is the project's icon-set state: `selected`, `none`, `ambiguous`,
  or `missing` (FR10, FR15). `by` names the rule that chose the target:
  `match` or `definition`. A kept icon carries `suggestion` when the
  project set has a `likely` match for it. Without a project icon set, the
  source is unchanged, both lists are empty, and `status` and `reason` say
  why.

### Themes

- **FR13 — A set's theme map points the shared names at its artwork.** A set
  MUST export the map named by `themeMap`: an object keyed by exactly the
  built-in definitions in its `map`, each value the artwork of the icon `map`
  names. A theme uses it directly:

  ```tsx
  import {themeIcons} from '@acme/glyph-icons';

  export const brand = defineTheme({name: 'brand', icons: themeIcons});
  ```

  A value is a binding, an element (`<XIcon />`), or a `createElement`,
  `jsx`, or `_jsx` call with the binding first. A set with a generated
  module (FR18) gets `themeIcons` written there: one entry per built-in
  definition in `map`, each an element of the set's own icon, hidden from
  assistive technology and sized `1em`, rewritten whenever `map` or the
  icons change, so an author never writes it by hand.

### Checks and catalogs

- **FR14 — `astryx integration check` proves the data matches the package.**
  It reads the package without running it. For each icon set it MUST report:

  | Code                              | Severity | When                                                                                                                                                      |
  | --------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `invalid_icon_set`                | error    | the descriptor, data file, or a definition file is invalid (FR3, FR3a)                                                                                    |
  | `icon_builtin_definition_missing` | error    | a built-in definition is not in `map`                                                                                                                     |
  | `icon_definition_missing`         | info     | another Astryx definition is not in `map`                                                                                                                 |
  | `icon_definition_unused`          | warning  | a definition the set declares is not in `map`                                                                                                             |
  | `icon_definition_shadowed`        | warning  | a definition the set declares has the name of an Astryx one                                                                                               |
  | `icon_module_not_public`          | error    | an icon or variant is read from a module other than the package or one of its `exports` subpaths (FR19)                                                   |
  | `icon_export_name`                | warning  | an export is not named `<Name>Icon` (FR19)                                                                                                                |
  | `icon_not_component`              | error    | an export is a literal value, not a component or an adapter call (FR19)                                                                                   |
  | `icon_export_missing`             | error    | the module does not export a named export, re-exports followed (relative files and installed packages), or the generated module or adapter does not exist |
  | `icon_module_invalid`             | error    | the set's module, a file it re-exports, or the generated module does not parse; reported once instead of a missing export per icon                        |
  | `icon_generated_types_mismatch`   | error    | the generated module's declaration file is missing or does not match the module                                                                           |
  | `icon_theme_map_mismatch`         | error    | the theme map's keys or values disagree with the built-in entries of `map`                                                                                |
  | `icon_theme_map_unchecked`        | warning  | a theme map entry is not one of the forms FR13 lists, so it is not checked                                                                                |
  | `icon_source_version_drift`       | warning  | the data names another upstream version than the package depends on                                                                                       |
  | `icon_license_notice_missing`     | warning  | a set with an upstream has no license notice file                                                                                                         |

  A definition finding names the definition's description and words, one
  finding per definition, and carries a `suggestion` (`{map, icon}`, printed
  `suggest: map.delete = "trash"`) only when one of the set's icons has the
  definition's name or one of its words as its whole `id`; nothing is
  guessed. When an export cannot be found because a re-export could not be
  followed, the message names that re-export. A theme map built at runtime
  is not checked. Errors fail the check; warnings fail only under `--strict`
  (`architecture:cli-surface` INV32 and INV35); `info` findings are reported
  and never fail or count as warnings, so a set that maps every built-in
  definition and every definition it declares passes `--strict`. Module
  specifiers resolve as Node resolves them, through every ancestor's
  `node_modules`. In text output, a package-wide finding is printed once,
  under the first check that reports it; the JSON lists it under each.

- **FR15 — `astryx doctor` checks the project's icon sets.** Doctor's
  `icon-sets` check MUST fail when `iconSet` names a set that is not installed,
  MUST warn when two or more sets are installed and `iconSet` is not set, and
  MUST warn for each installed set withdrawn by FR9 with the reason. A project
  with no icon sets passes.
- **FR16 — Discover lists icon sets as their own kind.** `astryx discover`
  treats `icon-set` as a contribution kind (`spec:AST-051/FR5`): a package's
  page lists its sets, `--type icon-set` keeps them, and a catalog entry MAY
  carry `iconCount` and `definitions`. `discover <package>/<set>` shows the
  set's description, license, icon count, default variant, and the
  definitions its `map` covers, plus the command that lists its icons. Individual icons are not
  discover items; `astryx icon` finds them.

### Authoring

- **FR18 — The CLI writes the set, one verified icon at a time.** Every
  command reads modules statically, never searches a library, and leaves
  files as they were when it fails.
  - `integration add icon-set <name>` writes the descriptor, a data file
    with an empty `map` and no icons, and the generated module with an empty
    `themeIcons`. With `--from <module>` it wraps every component the module
    exports, and, once the set declares an `adapter`, every data export
    (object or string) through it: an alias of one value is recorded once
    (the `…Icon` name preferred), each icon is named `<Name>Icon` with its id
    from the name, and `map` is filled only where a definition's name or one
    of its words equals an icon's id. Run again, it refreshes the icons, keeps
    every `map` entry whose icon still exists, and names the entries it
    removed.
  - Leading words every icon export of a library shares (`feather` in
    `featherEye` and `featherSun`) are a library prefix: ids and export
    names leave them out (`featherEye` is id `eye`, `EyeIcon`). `icon add`
    applies the same rule from the source module's exports, so its commands
    need no `--id`.
  - `integration add icon-definition <name> --description --words [--icon]
[--set]` writes one of the set's own definitions and, with `--icon`, its
    `map` entry. A name Astryx has is refused.
  - `icon add <Export> --from <module> [--set]` verifies the export and, with
    no definition flag, answers `icon.definitionMatches`: the definitions
    (Astryx's and the set's own) whose words fit the export, each with its
    description, source, score, reason, and the exact command; it writes
    nothing. `--definition <name>` adds the icon and maps it;
    `--new-definition <name> --description --words` also writes the set's own
    definition. `--default` reads the module's default export; `--appearance`,
    `--size`, and `--weight` with `--id` add a variant within `axes`. Running
    it again changes nothing. `--from` is a package, a subpath, or a `./`
    path in the package.
  - `icon map <definition> <icon> [--remove]` writes one `map` entry, refusing
    an unknown definition (suggesting `integration add icon-definition`) or
    icon (suggesting close ids). `icon use <set>` writes `iconSet` to
    astryx.config, refusing a set that is not installed or is ambiguous.
  - Each icon becomes an export of the set's generated module: a re-export
    when the library export is a component (a function, class, `forwardRef`,
    or `memo`), else `export const <Name>Icon = adaptIcon(<source>)` with the
    set's adapter, imported once. A non-component with no declared
    `adapter` is refused. Statements the module already has are kept,
    however it was formatted. Beside it the CLI writes its declaration file
    (`<set>.generated.d.ts`): each re-export as written, so a component keeps
    its library's types, each adapted icon as
    `ComponentType<SVGProps<SVGSVGElement>>`, and `themeIcons`. `icon add`,
    `icon map`, and the bulk wrap rewrite both. The data file names the set's
    own module; the receipt names the line the package entry needs to
    re-export the generated module.

- **FR19 — Every icon is a named component export of the package.** Every
  icon and variant is a named export of the set's package public entry (its
  name or an `exports` subpath), named `<Name>Icon` (a variant
  `<Name><Variant>Icon`). It is a React component, or an adapter call, that
  accepts SVG props (`className`, `style`, `aria-*`, `width`, `height`),
  draws with `currentColor`, and fills its box (`1em` or `100%`), so `<Icon>`
  sizes and colors it like a built-in icon. The module, name, and component
  shape are checked statically (FR14); color and size are documented with a
  render test authors can copy, because they cannot be read without running
  the icon.

### Wrapper packages

- **FR17 — A wrapper adds data, not artwork.** A wrapper package for an icon
  library MUST depend on that library, re-export its icons as named exports
  under the names in the data file, set `sideEffects: false`, and ship the data
  file, the theme map, and the library's license and notice text unchanged. It
  MUST NOT copy, modify, or bundle the library's artwork into its own files.
  Importing one icon brings in only that icon.

### Platform support

- Supported engines: the CLI's Node floor; wrappers support every React version
  Core supports.
- Unsupported behavior: a set whose module cannot be resolved does not answer
  (FR9); templates are then written unchanged (FR12).
- Browser evidence: none. Every behavior here is CLI output, written source, or
  a module's exports.

## Current-state impact

- `architecture:cli-surface`: adds the `iconSets` manifest root and the
  `icon-set` and `icon-definition` descriptor kinds to INV24's discovered
  kinds, the `icon-set` and `icon-definition` kinds of `integration add`, the
  `icon` command group (`use`, `map`, `add`) and its response types, the
  `icon` search domain, the `icon-definitions` docs namespace, the
  `icon-sets` Doctor check, and the icon-set checks of `integration check`
  (INV35).
- The CLI implements FR1–FR3a, FR5–FR10, FR11 and FR12 for `astryx
template`, FR13–FR16, FR18, and the static checks of FR19, and `doctor
integration validate` type-checks `IconSetDoc` descriptors
  (`architecture:cli-surface` INV34). These are not yet in the CLI: icon
  mapping in `astryx build` (FR11), and the wrapper generator and wrapper
  package checks (FR4, FR17).
- `contributing:cli-conventions`: lists `IconSetDoc`, `IconDefinitionDoc`,
  and the data file among the authoring types a new kind ships with.
- Consumer docs: `cli/integrations` documents authoring an icon set;
  `icon-definitions` lists every definition; `icons` documents finding icons
  and using a set's theme map; `template-icons` documents how copied
  templates follow the project's icon set.
- `spec:AST-051`: discover's kinds gain `icon-set`.
- Runtime icon resolution, `IconName`, `componentIcons`, and the Icon component
  are unchanged.

## Verification

| Contract   | Verification                                                                                                               | Representative states                                                                                                                                                                                                                | Mutation or failure expectation                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| FR1–FR3    | descriptor and data-file parser tests; discovery tests; `integration add` tests                                            | valid set; missing or misnamed descriptor; missing data file; unknown field; `schemaVersion: 2`; two sets in one package; a match with an unknown confidence; a match naming its own set; added set; existing file                   | a set without its descriptor or data file is discovered, or the manifest lists icons and still passes            |
| FR4        | wrapper generator test                                                                                                     | regenerate from the same upstream version; upstream adds an icon                                                                                                                                                                     | regenerating changes the file, or a new upstream icon is missing                                                 |
| FR5        | pack and discovery tests                                                                                                   | module path escaping the package; nested notice file                                                                                                                                                                                 | an escaped path is accepted, or discovery imports the icon module                                                |
| FR6–FR7    | `icon` command text and JSON tests                                                                                         | exact definition; exact id; exact word; an id one icon is named and another is tagged; a word many icons are named for; prefix; no match; `--set`; `--limit`; unknown set or id; `--list` coverage                                   | ranking order changes, a tie is order-dependent, or a missing icon is not `ERR_NOT_FOUND`                        |
| FR8        | search tests                                                                                                               | icon-only word; word matching a component and an icon; `--type icon`                                                                                                                                                                 | an icon outranks an equal component, or `--type icon` returns another domain                                     |
| FR9–FR10   | discovery and config tests                                                                                                 | set installed but module missing; invalid data file; one set; two sets with and without `iconSet`                                                                                                                                    | a withdrawn set answers, or two sets pick one silently                                                           |
| FR3a       | definition parser and folder tests; docs tree tests                                                                        | valid definition; unknown field; built-in set equals `IconName`; unique names; a set's own definition; one that shadows Astryx's; `docs icon-definitions`                                                                            | a definition outside a folder is read, or a built-in is missing                                                  |
| FR11–FR12  | template print and copy tests; a test over every bundled template descriptor                                               | reviewed exact or strong match; likely match suggested; declared definition the set maps; one it does not map; an undeclared import; installed-set icon; solid variant; name collision; no set; every bundled template icon declared | an unmapped icon is dropped, a name is guessed, a reference keeps the old name, or the receipt omits a kept icon |
| FR13, FR18 | writer and command tests                                                                                                   | adapter import across repeated adds; a formatted module; data library with and without an adapter; library prefix; `themeIcons` after `icon map`; declaration file; a set nested deeper than six folders                             | a second adapter import, a guessed prefix, or a stale theme map or declaration file                              |
| FR18       | command tests for `integration add icon-set --from`, `integration add icon-definition`, `icon add`, `icon map`, `icon use` | wrap and refresh; matches with no flag; `--definition`; `--new-definition`; an Astryx name refused; missing export with close names; `--default`; adapter required and used; idempotent re-run                                       | a file is written without verification, a failed write leaves files, or a re-run changes the file                |
| FR19       | `integration check` tests                                                                                                  | module outside the package; a name without `Icon`; a literal export; `export *` from an installed package; an unresolved re-export                                                                                                   | a deep or foreign module passes, or a literal export passes                                                      |
| FR13       | integration check tests; theme fixture                                                                                     | theme map equal to the built-in entries of `map`; extra key; missing key; wrong artwork; `createElement` and `jsx` values; an unreadable entry                                                                                       | a disagreeing theme map passes, or an unreadable entry passes silently                                           |
| FR14       | `integration check` tests, with and without `--strict`                                                                     | every error listed in FR14; upstream version drift; missing notice                                                                                                                                                                   | an export the module lacks passes, or a warning fails without `--strict`                                         |
| FR15       | Doctor tests                                                                                                               | no sets; one set; two sets without `iconSet`; `iconSet` not installed; invalid data file                                                                                                                                             | a missing configured set passes, or no sets warns                                                                |
| FR16       | discover tests                                                                                                             | package adding a set; `--type icon-set`; item page                                                                                                                                                                                   | icon sets are not listed, or icons appear as discover items                                                      |
| FR17       | wrapper package tests                                                                                                      | named re-exports; one-icon import bundle size; license text present                                                                                                                                                                  | a wrapper bundles artwork, drops a notice, or importing one icon pulls in the library                            |

## Decision log

### DEC-1 — The icon set is the item; its data file is the item's payload

**Reference:** `spec:AST-084/DEC-1`
**Decider:** `josephfarina`, `2026-10-20`

One set is one discoverable item with one typed descriptor, like a theme. The
data file is generated payload inside the set's own directory, the way a theme's
token files are, so adding a set touches no shared file and the no-catalog rule
(`spec:AST-039/FR11`) holds. Every surface reads that one file, so search,
templates, and themes cannot disagree about what an icon means.

Rejected: one `.doc.mjs` per icon, because thousands of hand-kept files cannot
stay in step with an upstream library that adds icons every release.

### DEC-2 — Find icons with a dedicated command and in search

**Reference:** `spec:AST-084/DEC-2`
**Decider:** `josephfarina`, `2026-10-20`

`astryx search` is where an agent looks first, so icons appear there. An icon
answer needs the import line, the variants, and the definitions it draws, which
a mixed search list cannot carry for every domain, so `astryx icon` answers with
the full record.

### DEC-3 — Templates keep their icon when the set has no match

**Reference:** `spec:AST-084/DEC-3`
**Decider:** `josephfarina`, `2026-10-20`

A copied template always renders. Keeping the original icon, and saying so in
the receipt, is visible and fixable; a guessed icon with the wrong meaning is
neither.

Rejected: replacing an unmatched icon with a placeholder glyph, because it
silently changes what the template says.

### DEC-4 — Libraries without data join through wrapper packages

**Reference:** `spec:AST-084/DEC-4`
**Decider:** `josephfarina`, `2026-10-20`

A wrapper adds the data, theme map, and names Astryx needs without forking the
library: artwork stays in the upstream package, under its license, and updates
with it. Re-exports keep imports tree-shakeable, so an app pays only for the
icons it uses.

### DEC-5 — An exact query asks for a meaning unless the sets mostly use it as a name

**Reference:** `spec:AST-084/DEC-5`
**Decider:** `josephfarina`, `2026-10-20`

An icon's `id` names its artwork; its other words say what it is for. A
library may name an icon for a key or an object (`delete` draws the Delete
key) while the same word is what people type to find a different icon
(`trash`, tagged `delete`). The searched sets decide which reading leads,
from their own data: a word more icons are named for than tagged with
(`user`) keeps name matches first; otherwise meaning matches lead. Ties go
to meaning, because `words` are, by definition, what people search for.

Rejected: ranking every id match above every word match, because it answers
`delete` with the Delete key; and ranking every tag above every name,
because it answers `user` with an icon only tagged `user`.

### DEC-6 — Astryx owns the icon definitions; sets map to them; the CLI knows no library

**Reference:** `spec:AST-084/DEC-6`
**Decider:** `josephfarina`, `2026-10-20`

Meaning lives in one place: a folder of typed definition files Astryx owns,
which sets extend with their own files without a pull request. A set says
which of its icons draws each definition in one `map`; templates say which
definition each of their icons draws in their own descriptors. Mapping is
then a lookup, not a guess, and works for any library, because the CLI holds
no table of any library's names. The author or agent picks icons; the CLI
verifies exports, writes the files, and checks the set.

Rejected: per-icon `fills` lists, because one set-level map is what a theme
needs and what an author edits; bundled records of particular libraries,
because they go stale and favor some libraries over others; and guessing a
template icon's match from its id or words, because a wrong guess changes
what the template says.

### DEC-7 — Every icon is a component the set's package exports

**Reference:** `spec:AST-084/DEC-7`
**Decider:** `josephfarina`, `2026-10-20`

Apps, templates, and theme maps import every icon from the set's own
package, named `<Name>Icon`, as a component. A generated module re-exports
library components and applies the set's adapter to anything else, so a
library that ships data objects, SVG strings, or one file per icon works the
same way as one that ships components.

## Open questions

None.
