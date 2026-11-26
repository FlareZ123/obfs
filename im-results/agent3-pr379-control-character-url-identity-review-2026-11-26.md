# PR #379 review: control-character URL/POSIX identity mismatch

**Status:** intermediate, source-pinned adversarial review; production candidate remains blocked pending correction.  
**Reviewed PR:** [#379 — Integrate ESM URL identity and import-attribute guards](https://github.com/FlareZ123/obfs/pull/379)  
**Exact reviewed head:** `1a60af1facbceeed0417017581a092cc9fb8080c`  
**Review date:** 2026-11-26

## Finding

The candidate rejects repeated separators, literal terminal dot segments, and encoded separators/dot segments in several path resolvers, but it does not reject literal ASCII TAB, LF, or CR characters in an ESM specifier.

This leaves a WHATWG URL versus POSIX normalization mismatch:

- WHATWG URL parsing removes literal U+0009 TAB, U+000A LF, and U+000D CR characters from the URL input before path-segment resolution.
- `path.posix.normalize()` treats those characters as ordinary segment contents.

A control character can therefore turn a segment such as `..\\t` into the URL dot segment `..`, while the POSIX resolver sees an ordinary segment named `..\\t`. A following `..` then removes a different parent on the two paths.

## Minimal reproducer

From `dir/entry.mjs`:

```js
import { value } from './a/..\\t/../secret.mjs';
```

The `\\t` in the JavaScript string literal becomes an actual TAB in the specifier value.

On Node.js 22.16.0:

```js
new URL(
  './a/..\\t/../secret.mjs',
  'https://example.test/obfs/dir/entry.mjs'
).pathname;
// '/obfs/secret.mjs'

path.posix.normalize(
  path.posix.join('dir', './a/..\\t/../secret.mjs')
);
// 'dir/a/secret.mjs'
```

I also ran actual Node ESM imports, not just the URL constructor. The imported module was the WHATWG-resolved file, not the POSIX-selected file.

The same divergence reproduces for all six cases below:

| Specifier segment | WHATWG URL target | POSIX target |
|---|---|---|
| `..\\t/../secret.mjs` | `secret.mjs` | `dir/a/secret.mjs` |
| `..\\n/../secret.mjs` | `secret.mjs` | `dir/a/secret.mjs` |
| `..\\r/../secret.mjs` | `secret.mjs` | `dir/a/secret.mjs` |
| `.\\t/../secret.mjs` | `dir/secret.mjs` | `dir/a/secret.mjs` |
| `.\\n/../secret.mjs` | `dir/secret.mjs` | `dir/a/secret.mjs` |
| `.\\r/../secret.mjs` | `dir/secret.mjs` | `dir/a/secret.mjs` |

The six native-import controls loaded the expected URL target markers. A bounded scan over ASCII code points 0–127 for the `dot-or-dotdot + character + /../secret.mjs` family found TAB, LF, and CR as the admitted mismatches after applying the candidate's CLI admission checks.

## Why the SCO selector admits it

At this reviewed head, `src/cli.js`:

1. Rejects literal backslashes.
2. Rejects empty path segments (repeated/trailing separators) and literal terminal `.` / `..`.
3. Decodes each segment with `decodeURIComponent()`.
4. Rejects decoded slash, backslash, NUL, and percent-encoded dot segments.
5. Resolves the remaining path with `path.posix.normalize()`.

Relevant code: [`src/cli.js` lines 322–350](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/cli.js#L322-L350).

For `./a/..\\t/../secret.mjs`, the TAB is neither a slash, backslash, NUL, nor an encoded dot segment. It is not a literal terminal dot segment, and the path has no empty segment. The CLI therefore computes `dir/a/secret.mjs` and includes it if that file exists in the source tree.

The SCO handler subsequently parses the request URL using `new URL()` and decodes the canonical pathname: [`src/sco.js` lines 328–343](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/sco.js#L328-L343). The browser's actual import resolves to `/obfs/secret.mjs`, while the selector can publish `/obfs/dir/a/secret.mjs`.

### Security consequence

Given a source tree containing:

- `dir/entry.mjs` — the selected entry;
- `secret.mjs` — the actual URL-resolved dependency, which need not be selected by the current POSIX result;
- `dir/a/secret.mjs` — a separate private file;

the current selector can publish `dir/a/secret.mjs` even though the browser import resolves to `secret.mjs`. A requester can then ask the SCO handler directly for the wrong, otherwise-unselected file. The actual browser import may 404 while the private file is exposed.

This is a private-by-default publication-boundary failure, not merely a module identity or compatibility issue.

## Other affected proof surfaces

The same unguarded URL/POSIX assumption appears in the integrated candidate:

- `src/core.js:50–63` — `completeGuardedModuleGraph()`.
- `src/core.js:149–170` — `staticallyImportedEsmTargets()`.
- `src/core.js:185–197` — `hasUnprovedModuleImport()`.
- `src/cross-properties.js:30–39` — `resolveImport()` and its graph admission. The latest cross-properties change rejects query/fragment/percent/backslash spellings, but still does not reject TAB/LF/CR.
- `src/source-observer-islands.js:156–162` — `resolveKnownImport()`.

Depending on which other files are supplied, these can attribute an import to the wrong owner, declare an incomplete host-lock graph complete, or omit the actual URL-resolved dependency from decoder/source-observer analysis.

The private SCO graph helpers in `src/sco-graph.js` and `src/sco-selective-partition.js` use stricter canonical-spelling comparisons and reject this exact noncanonical spelling; that does not repair the general CLI or the other graph resolvers.

## Other requested dimensions checked

No additional admitted mismatch was found in the bounded checks for:

- repeated separators;
- literal terminal dot/dot-dot segments;
- trailing slashes;
- percent-encoded dot segments and path separators;
- query and fragment suffixes.

The CLI's empty-segment and terminal-dot checks, percent-decoding checks, and the other graph resolvers' stricter refusals cover those tested cases. Query/fragment suffixes are removed from the CLI's path portion and from WHATWG `URL.pathname`; graph-proof layers conservatively refuse query/fragment specifiers. This is not a proof that every possible URL spelling has been exhausted.

## Recommended correction

Use one shared URL-specifier admission predicate in every resolver rather than adding another local patch. At minimum, refuse literal U+0009, U+000A, and U+000D anywhere in a relative module specifier before any POSIX normalization. Consider rejecting all literal C0 controls as a conservative policy, while retaining ordinary encoded and unencoded space support where the file-path rules permit it.

Apply the same predicate to:

- SCO CLI static dependency selection;
- closed-world host-lock graph admission;
- static ESM decoder dependency discovery;
- unproved-module-import detection;
- cross-file property graph resolution;
- source-observer-island resolution.

Add red-first tests for TAB/LF/CR with both dot and dot-dot segments, including:

1. A full SCO CLI/HTTP test with both the actual URL target and a distinct POSIX-selected private file present; assert the private path is not served (preferably fail startup with an explicit noncanonical-specifier error).
2. Cross-file property proof refusal for the mismatched edge.
3. Host-lock and decoder graph fail-closed controls.
4. A real-browser ESM resolution case in the existing browser suite.

## Validation boundary

- Source inspection is pinned to PR head `1a60af1facbceeed0417017581a092cc9fb8080c`.
- The URL/POSIX comparison and native ESM import were executed locally with Node.js 22.16.0.
- The CLI publication consequence is derived from the exact candidate selector and handler code; I did not modify the PR branch or claim a full CLI/HTTP CI reproduction.
- No production source changes were made by this review.

**Disposition:** keep PR #379 draft / no-merge until this path-identity mismatch is rejected and the end-to-end SCO exposure regression passes on the exact updated candidate.
