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

A second witness keeps both candidate targets as ordinary in-tree file paths:

```js
import { value } from './a/.\\t/../secret.mjs';
```

From `dir/entry.mjs`, WHATWG URL / native Node ESM resolves this to `dir/secret.mjs`, while the candidate's POSIX resolver resolves it to `dir/a/secret.mjs`. Both are safe file names. The current cross-properties preflight and `resolveImport()` admit the edge and can treat `dir/a/secret.mjs` as the imported owner when both files are in the declared group. This makes the owner-misattribution / property-rewrite concern concrete without relying on a route escape. The same witness also works with the SCO CLI's default root entry: from `index.mjs`, `./a/.\\t/../secret.mjs` resolves under native static ESM to root `secret.mjs`, while POSIX selects `a/secret.mjs`; I ran the static import with distinct markers and Node loaded the root target. An extended local mirror of the PR's bounded audit grammar (27 atoms, seven suffixes, path lengths one through four; 3,863,160 generated strings) found 804 cross-properties URL/path-key mismatches. These are model counts, not end-to-end test counts.

## Why the SCO selector admits it

At this reviewed head, `src/cli.js`:

1. Rejects literal backslashes.
2. Rejects empty path segments (repeated/trailing separators) and literal terminal `.` / `..`.
3. Decodes each segment with `decodeURIComponent()`.
4. Rejects decoded slash, backslash, NUL, and percent-encoded dot segments.
5. Resolves the remaining path with `path.posix.normalize()`.

Relevant code: [`src/cli.js` lines 322–350](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/cli.js#L322-L350).

For `./a/..\\t/../secret.mjs`, the TAB is neither a slash, backslash, NUL, nor an encoded dot segment. It is not a literal terminal dot segment, and the path has no empty segment. The CLI therefore computes `dir/a/secret.mjs` and includes it if that file exists in the source tree.

The SCO handler parses the incoming request URL with `new URL(request.url, 'http://localhost')` and performs its source lookup using the resulting `url.pathname`: [`src/sco.js` lines 624–659](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/sco.js#L624-L659). At startup, `createScoHandler()` constructs its `inputs` map directly from the prepared selected files at [`src/sco.js` line 594](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/sco.js#L594), then serves the looked-up entry at lines 657–668. Thus a wrong file admitted by the CLI selector is directly addressable. Its path decoder is at [`src/sco.js` lines 328–343](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/sco.js#L328-L343). The browser's actual import resolves to `/obfs/secret.mjs`, while the selector can publish `/obfs/dir/a/secret.mjs`. The CLI then passes the selector's returned `clientFiles` directly to `createScoHandler()` at [`src/cli.js` lines 503–506](https://github.com/FlareZ123/obfs/blob/1a60af1facbceeed0417017581a092cc9fb8080c/src/cli.js#L503-L506); there is no second independent dependency-path check to correct the selected set.

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

## Mode-specific impact

- **SCO:** concrete publication-boundary failure. The CLI can select the POSIX decoy, and the handler serves selected files by canonical request pathname. The actual URL-resolved dependency may be absent while the wrong private file is addressable.
- **COO:** the cross-file property graph can attribute an import to the POSIX decoy instead of the module that native ESM loads. If both files are in the distributed group and expose the same imported binding shape, the proof may rename the decoy's property and the importer while leaving the actual URL target's property unchanged. The resulting runtime behavior regression should be captured by a red-first transformation test; I have not executed the full transformation locally.
- **SNO:** `completeGuardedModuleGraph()` can regard the supplied graph as closed because the POSIX decoy exists, even if the actual URL-resolved dependency is outside the supplied group but still present on the server filesystem. The host-lock proof then does not account for that actual dependency. The practical impact depends on the SNO caller's source-group boundary and should be validated with a filesystem-backed test; this is a proof-soundness risk, not a demonstrated end-to-end bypass.
- **Decoder/source-observer analysis:** the same false edge can omit the actual module from `staticallyImportedEsmTargets()` or source-observer island analysis and can make `hasUnprovedModuleImport()` return false based on the decoy. Add targeted tests before relying on these proofs.

## Other requested dimensions checked

No additional admitted mismatch was found in the bounded checks for:

- repeated separators;
- literal terminal dot/dot-dot segments;
- trailing slashes;
- percent-encoded dot segments and path separators;
- query and fragment suffixes.

The CLI's empty-segment and terminal-dot checks, percent-decoding checks, and the other graph resolvers' stricter refusals cover those tested cases. Query/fragment suffixes are removed from the CLI's path portion and from WHATWG `URL.pathname`; graph-proof layers conservatively refuse query/fragment specifiers. This is not a proof that every possible URL spelling has been exhausted.

The existing PR-side bounded audit at `sims/esm-url-path-identity-audit.js` enumerates 21 segment atoms and seven suffix forms, but its atom list contains no literal TAB, LF, or CR and no dot/dot-dot-plus-control segments. Its 1,429,428 generated cases and zero post-terminal-dot mismatches therefore do not cover this counterexample class. Adding the six atoms `".\\t"`, `"..\\t"`, `".\\n"`, `"..\\n"`, `".\\r"`, and `"..\\r"` is sufficient for its existing grammar to exercise the six witnesses.

A focused placement check broadened the six minimal witnesses: for each of TAB, LF, and CR, I inserted the character at every possible position in the `.` and `..` segments (15 variants total), followed by `/../secret.mjs`. Using Node v22.16.0 `import.meta.resolve()` from a real file-backed `dir/entry.mjs`, all 15 resolved to either `dir/secret.mjs` or `secret.mjs`, while POSIX normalization selected `dir/a/secret.mjs` in every case: **15/15 mismatches**. The standalone reproducer is [`im-results/agent3-url-control-char-identity-repro/dir/entry.mjs`](https://github.com/FlareZ123/obfs/blob/de2a657980236679856f6501f36e334dcff70838/im-results/agent3-url-control-char-identity-repro/dir/entry.mjs); I reran that exact script locally and confirmed `totalCases=15`, `mismatchCount=15`. The six atoms suggested for the existing Cartesian audit are sufficient to reproduce the class, but a separate 15-case unit test is a more complete and cheaper placement check than expanding that full generator to 36 atoms.

## Recommended correction

Use one shared URL-specifier admission predicate in every resolver rather than adding another local patch. At minimum, refuse literal U+0009, U+000A, and U+000D in the pathname portion of a relative module specifier before any POSIX normalization. Consider rejecting all literal C0 controls plus DEL as a conservative policy, while retaining ordinary encoded and unencoded U+0020 space support where the file-path rules permit it.

Apply the same predicate to:

- SCO CLI static dependency selection;
- closed-world host-lock graph admission;
- static ESM decoder dependency discovery;
- unproved-module-import detection;
- cross-file property graph resolution;
- source-observer-island resolution.

A local rerun of the same extended grammar with a path-only C0/DEL predicate (`/[\\u0000-\\u001F\\u007F]/u` on the substring before the first `?` or `#`) applied to both the CLI and cross-properties resolver eliminated all remaining mismatches after the existing safe-file filter: **0 CLI mismatches and 0 cross-properties mismatches across 3,863,160 generated strings**. The guard does not reject ordinary U+0020 spaces. This is a bounded repair check, not a universal URL grammar proof.

Add red-first tests for TAB/LF/CR with both dot and dot-dot segments, including:

1. A full SCO CLI/HTTP test with both the actual URL target and a distinct POSIX-selected private file present; assert the private path is not served (preferably fail startup with an explicit noncanonical-specifier error).
2. Cross-file property proof refusal for the mismatched edge.
3. Host-lock and decoder graph fail-closed controls.
4. A real-browser ESM resolution case in the existing browser suite.

Longer term, avoid maintaining parallel POSIX and WHATWG interpretations of the same static import edge. Resolve browser-target edges against the actual HTTP(S) module URL base for SCO/COO, and Node-target edges using Node's file-URL/ESM resolution for SNO; then map the canonical URL target back into the allowed source root and fail closed if it is outside the group. The shared control predicate is the immediate conservative fix; a mode-aware canonical resolver is the more general architecture.

## Recheck after the original review pin

The PR branch later advanced to `8a6540d33e86230ae0cd7df0c3424673241c11e3`. A compare from the reviewed head `1a60af1...` to `8a6540d...` contained no `src/` changes, so the production path predicates and selector described above remained unchanged at that later head. Agent 7 independently reproduced all six variants with Node v22.23.4 and traced the decoy through the selector into the SCO handler's input/public-path set; see `communications/agent1/20261126T004000Z_agent7-control-character-reproduction.md` and `communications/agent3/20261126T004200Z_agent7-control-char-independent-confirmation.md`. GitHub Actions run 4119 (id `45729761223`) on head `8a6540d...` completed successfully, but only `focused (ubuntu-latest)` and `focused (windows-latest)` ran; the `node22` job was skipped. It did not include control-character tests, so it does not discharge the finding.

## Applicability to current main

This is not limited to the stale PR branch. At current-main pin `cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1`, the same root-entry witness is accepted by the live SCO selector: `src/cli.js` follows static relative imports, decodes segments, and feeds them to `path.posix.normalize()` without rejecting pathname C0 controls ([lines 314–355](https://github.com/FlareZ123/obfs/blob/cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1/src/cli.js#L314-L355)). The same omission exists in current-main `completeGuardedModuleGraph()` ([`src/core.js` lines 50–68](https://github.com/FlareZ123/obfs/blob/cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1/src/core.js#L50-L68)), cross-file `resolveImport()` ([`src/cross-properties.js` lines 24–33](https://github.com/FlareZ123/obfs/blob/cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1/src/cross-properties.js#L24-L33)), and `resolveKnownImport()` ([`src/source-observer-islands.js` lines 150–161](https://github.com/FlareZ123/obfs/blob/cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1/src/source-observer-islands.js#L150-L161)). The current main CLI passes the selected files directly to `createScoHandler()` ([`src/cli.js` lines 493–500](https://github.com/FlareZ123/obfs/blob/cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1/src/cli.js#L493-L500)); the handler builds its input map from those files at `src/sco.js:594` and serves by request pathname at lines 650–668.

The PR branch adds useful guards for repeated separators, encoded dot segments and terminal dot segments, but it still omits the C0/DEL pathname check. Therefore, merging the current PR unchanged would not close the control-character issue, and current main already has the same underlying mismatch (with fewer path guards).

## Integration freshness

The PR branch remains at head `8a6540d33e86230ae0cd7df0c3424673241c11e3`, based on common ancestor `f702618881046b831f52c3e4e8fbc926483712a4`. At latest main pin `cc2e9f057ecbeddc91b033614b6ca33d48b0b5e1`, main is **91 commits ahead** of that base while the PR is **16 commits ahead**. Main changed 47 paths and the PR changed 22, with **zero path overlap**. GitHub's latest `mergeable` field is currently `null` (pending calculation); an earlier recheck reported `true`, so no file conflict has been demonstrated. The PR metadata/body still reflects the stale base snapshot (“16 ahead / 0 behind”), not current main.

This is a validation-freshness issue rather than an established merge-conflict blocker: refresh/rebase or merge the candidate onto current main, inspect the resulting exact head, and rerun validation before relying on the old run results. The PR branch's source files remain unchanged since `8a6540d...`, so the C0/DEL pathname guard is still absent from that candidate.
 
## Validation boundary

- Source inspection is pinned to PR head `1a60af1facbceeed0417017581a092cc9fb8080c`.
- The URL/POSIX comparison and native ESM import were executed locally with Node.js 22.16.0.
- The CLI publication consequence is derived from the exact candidate selector and handler code; I did not modify the PR branch or claim a full CLI/HTTP CI reproduction.
- No production source changes were made by this review.

**Disposition:** keep PR #379 draft / no-merge until this path-identity mismatch is rejected and the end-to-end SCO exposure regression passes on the exact updated candidate.
