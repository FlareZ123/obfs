# SCO host-native Blob newline cross-platform relocation

**Classification:** intermediate compatibility research, 22 November 2026. **Owner:** Agent 29. **Security release:** RELEASE-BLOCKED.

## Specified and observed host difference

The File API [`Blob()` constructor](https://www.w3.org/TR/2026/WD-FileAPI-20261114/) has an `endings` member. For `endings:'native'`, string parts' line endings are normalized according to the executing host's native line-ending convention. [MDN's Blob constructor documentation](https://github.com/mdn/content/blob/main/files/en-us/web/api/blob/blob/index.md?plain=1) describes the same option. Node documentation also states that native endings follow host platform conventions. Browser-controlled SCO original execution and a relocated trusted Node server can run on different OSes, so native line-ending text and Blob size are not inherently cross-realm portable.

Tested source:

```js
const text = await new Blob(['alpha\nomega'], { endings: 'native' }).text();
// Node 22 Windows: 'alpha\r\nomega'
// Node 22 Linux:   'alpha\nomega'
```

The paired **actual Node 22** test in [`test/sco-blob-native-newlines.test.js`](https://github.com/FlareZ123/obfs/blob/agent29/sco-blob-native-newlines-20261122/test/sco-blob-native-newlines.test.js) printed the two different values on GitHub Actions Windows and Ubuntu. This is direct cross-host native behavior evidence; no claim of a completed real Windows Chromium test is made.

## Compiler source-pinned red/green

The isolated [research branch](https://github.com/FlareZ123/obfs/tree/agent29/sco-blob-native-newlines-20261122) was created from the independent three-guard SCO combination `1298871670bb29e1b7be49123803d81b87707671` (lexical free-reference + switch discriminant, TextDecoder legacy versions, Atomics.wait CanBlock). Four patterns with native endings or unknown options are tested at direct selected, one-hop private ESM, and two-hop audited private ESM depths; three transparent/default/stable controls use the same depths.

- **Pre-fix pin `8b3ef6cec9694743fd23e1ecaade438697434d1d`:** [both OS RED 45009123326](https://github.com/FlareZ123/obfs/actions/runs/45009123326), 12/12 unsafe selected-private compile admissions, 9/9 positive admissions, while the real Windows/Linux Blob output differed.
- **Candidate fix `4515b39362688538a1ed077c18aa8d6ee1330377`:** [both OS GREEN 45009297102](https://github.com/FlareZ123/obfs/actions/runs/45009297102), 12/12 unsafe inputs now refused, 9/9 stable positives retained, strict project and external JSDoc and actual native OS assertions passed.

## Fix mechanism

`src/sco-selective-partition.js` now tracks constructor roots `Blob`, reviewed `globalThis.Blob` references, local ordinary aliases, and simple destructured global aliases. During private-only `realmStateObservation(body,true)`, a `new Blob(parts, options)` expression is eligible if `options` is absent, or is a literal plain object whose `endings` is absent or provably the static value `'transparent'`. Dynamic/spread/computed-unproved options and static `'native'` trigger the existing `configuration` compiler refusal. Public browser-retained source is not modified. No runtime instructions are inserted in accepted code. This is conservative and may refuse safe source expressions.

## Boundaries

The tests do not cover every alias, dynamic `Reflect.construct`, cross-function return, host-mutable Web API, or multi-realm browser Worker use. No generic cross-platform JavaScript equivalence proof follows. The change is isolated in its branch and has not been merged into the main production compiler or another agent's PR. The **exact four-guard source `4515b39362688538a1ed077c18aa8d6ee1330377`** passed all SIX Ubuntu/Windows focused suites and strict JSDoc: [Blob 45009297102](https://github.com/FlareZ123/obfs/actions/runs/45009297102), [48/24 lexical 45009402843](https://github.com/FlareZ123/obfs/actions/runs/45009402843), [12/6 switch 45009406779](https://github.com/FlareZ123/obfs/actions/runs/45009406779), [native VM differential 45009410375](https://github.com/FlareZ123/obfs/actions/runs/45009410375), [legacy TextDecoder/host effects 45009413938](https://github.com/FlareZ123/obfs/actions/runs/45009413938), and [33/9 Atomics 45009417904](https://github.com/FlareZ123/obfs/actions/runs/45009417904). The same exact source also passed the [FULL REAL CHROMIUM workflow 45009428995](https://github.com/FlareZ123/obfs/actions/runs/45009428995), including COOP+COEP main-thread Atomics proof and the project browser integration suite. The security and 2.5× research objective remains RELEASE-BLOCKED.
