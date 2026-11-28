# CSS.escape implicit function-source observation

**Status: verified focused Node 22, cross-file ESM, and native Chromium
differentials.** Agent 19, 22 November 2026. Branch:
`agent19/css-escape-source-observer-20261122`, draft [PR #308](https://github.com/FlareZ123/obfs/pull/308).
This is compiler semantic-preservation evidence. It does not establish code
secrecy, hostile-runtime tamper resistance, or the primary 2.5× compute budget.

## Why this matters

The [CSSOM `CSS.escape` definition](https://drafts.csswg.org/cssom/#the-css.escape()-method)
accepts `CSSOMString` and serializes a CSS identifier. Web IDL converts
`CSSOMString` inputs using ECMAScript ToString. Passing a function can
serialize its original `Function#toString` spelling; renaming a private field
in the function changes an observable result even though the source never
directly invokes `.toString()`. The existing
`src/ast.js::observesFunctionSource` missed this browser API.

The compile-time patch recognizes directly addressed
`CSS.escape`, `globalThis.CSS.escape`, `window.CSS.escape`,
`self.CSS.escape`, sequence wrappers, detached/bound/transitive
aliases, destructuring, `.call`/`.apply`/`.bind`,
`Reflect.apply`, and bounded `Reflect.get` extractions.
Its source-observer refusal preserves the original source bytes when a
function-valued argument cannot be ruled out. Literal-only calls still
permit unrelated private-field renaming. There is no generated runtime
overhead from this guard.

## Reproducible red-green record

1. Original source miss: [focused CI 45081766566](https://github.com/FlareZ123/obfs/actions/runs/45081766566)
   at `70cb53ed0cfcdb2636e130bbae19e860ccd981e1`,
   direct `CSS.escape`, global path, and `Reflect.apply` analyzer checks
   false rather than true. A separate positive-control failure was a
   test-only cross-realm `vm` equality mistake, subsequently corrected.
   [Focused green 45081865621](https://github.com/FlareZ123/obfs/actions/runs/45081865621)
   at `ab7c3e622c0e9ce2df7642dbabf8ca71069b0675` passed Ubuntu,
   Windows, project JSDoc, and external JSDoc.
2. Additional alias misses: [focused red 45082280292](https://github.com/FlareZ123/obfs/actions/runs/45082280292)
   at `b8efe8e965f49b1c994f1a27ab9dc5511d4c649f`
   passed 8/12, failing sequence wrapper, transitive alias,
   direct bound call and destructuring. A bounded fixed-point alias
   summary produced [focused green 45082324122](https://github.com/FlareZ123/obfs/actions/runs/45082324122)
   at `7761e83ba8da05a3aa93aef3575f9dbdd34be054`, both OSes.
3. Reflection access misses: [focused red 45082749131](https://github.com/FlareZ123/obfs/actions/runs/45082749131)
   at `6ee6fdc5bae18518f2a05e7a2f91a2fdb9ded1af`
   passed 12/16 and failed four `Reflect.get` acquisition forms.
   An initial fix exposed a temporal-dead-zone initialization error
   under one detached alias: [red 45082808042](https://github.com/FlareZ123/obfs/actions/runs/45082808042)
   at `9278456a7b2d4b4c237c8d49f5c69874da742757`.
   Collection of direct aliases now runs first; reflected aliases use
   a separate fixed point after the reflective method summaries are
   initialized. [Focused green 45082973397](https://github.com/FlareZ123/obfs/actions/runs/45082973397)
   at `41865c3119701ee8a9fec272af4e05f6592dc561` passed both OSes,
   including all 16 source cases and strict JSDoc.
4. Native Chromium differential: [browser run 45081997792](https://github.com/FlareZ123/obfs/actions/runs/45081997792)
   at `1a5cb304c9a6784086d90b9412e8acc4439d16e3`
   passed direct function-source and safe primitive-positive tests.
   [Expanded full browser run 45082435227](https://github.com/FlareZ123/obfs/actions/runs/45082435227)
   at `18d62668ec829e7aadd22f7e5c06f4e61ee87eec`
   passed direct, detached, destructured, and bound native
   source-observer cases with a separately transformed private-key positive.
   The **full Node Ubuntu and Windows integration workflow also passed**
   [run 45082444152](https://github.com/FlareZ123/obfs/actions/runs/45082444152)
   at the same SHA.
5. Two-file ESM differential: four source-bearing imports from
   `logic.mjs` into `observer.mjs` passed initially; the primitive
   positive first failed because a host mock's `String(value)` was
   accidentally embedded in the protected source. Moving that mock
   outside the analyzed graph corrected the fixture:
   [focused two-OS green 45082599712](https://github.com/FlareZ123/obfs/actions/runs/45082599712)
   at `1c77a84cafc1f42df679012df2822cd2dc935516`.

## Reproduction and limitations

The Node focused fixture `test/css-escape-function-source.test.js`
uses a mock of the **string-conversion step** only; it is not a
native CSS escaping implementation. `test/css-escape-source-browser.js`
validates actual browser-native `CSS.escape` via separate Chromium pages.
`test/css-escape-interfile-source.test.js` validates real ESM graph loading
with the host coercion fixture injected outside distributed source bytes.
`.github/workflows/manual-browser.yml` runs the browser differential.

The updated reflection-integrated branch at
`c5f3036e4bc8d01bbcfc7fc13ffb2e9e2798775a` passed
**full Ubuntu and Windows Node integration**
[run 45084317811](https://github.com/FlareZ123/obfs/actions/runs/45084317811)
and **full native Chromium**
[run 45083899262](https://github.com/FlareZ123/obfs/actions/runs/45083899262).
The latter includes the new actual Chrome two-module
`test/css-escape-esm-browser.js` private-source import case, as well
as the original direct/detached/bound native cases. Its literal-only
positive still transforms an unrelated private property.
An independently imported `export const escape=CSS.escape`
through a separate `method.mjs` already preserved source text through
the existing general source-observer safety guard, with no extra
compiler analysis required; see
[focused two-OS run 45083892055](https://github.com/FlareZ123/obfs/actions/runs/45083892055)
at the same exact SHA. The final branch has JSDoc, focused,
full runtime, and Chromium evidence at one source pin.

The proof is pinned to the source described above; moving this
guard onto the evolving canonical main branch requires another run against
the merged source. Its test outcomes are facts about the measured cases,
not about all JavaScript environments.

The predicate remains finite and conservative. It cannot prove safety under
arbitrary runtime-selected aliases, hostile monkey-patching, or opaque
external functions. A shadowed `CSS` identifier may cause unnecessary
source-preservation refusal. That is a yield limitation, not a claim of
obfuscator strength. The project [decision index](../results/README.md)
remains **RELEASE-BLOCKED**; there is no new empirical attack-cost
or authorized-environment-resistance result.

Agent 3 was contacted in
`communications/agent3/20261122T231400Z_agent19_css-escape-source-observer.md`
as the canonical source-observer integrator. Merge only the smallest
proven compatible slice after resolving any concurrent changes.
