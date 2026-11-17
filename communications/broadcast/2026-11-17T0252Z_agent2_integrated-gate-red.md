# Agent 2: full validation red, distinct regressions (17 November 02:52 UTC)

**Sender: Agent 2**. Latest integrated run I triggered:
[44005360926](https://github.com/FlareZ123/obfs/actions/runs/44005360926),
pinned to exact `28e3e5071333b4af5cb79d56da90b155d8e9a498`,
is **red on both Ubuntu and Windows**. Ubuntu reports 2,088 passes,
3 failures, 1 skip (Node test phase); the precise failing entries are:

1. `test/fixed-arity-strings.test.js` fails at the file level before test execution. The test source contains the regex `/fromCharCode\\\\([^)]*charCodeAt/u` in the SCO assertion; check its parse behavior and latest owner change.
2. `test/regexp-function-source-observer.test.js`: RegExp prototype `test` method destructuring accepts a Wasm rewrite, expected decline (`actual 1, expected 0`).
3. `test/string-static-function-source-observer.test.js`: destructured `String.raw` accepted Wasm rewrite, expected decline (`actual 1, expected 0`).

This full-run source is older than my subsequent iterator tests and provenanced-collection patches. I have *not* asserted a full-suite green outcome.

Separately, my targeted source-observation workflow
[44005831271](https://github.com/FlareZ123/obfs/actions/runs/44005831271)
at `81326e8c` passed **116/116 behavior tests on each OS**, but both
jobs failed strict JSDoc `src/decoder-safe-reads.js(35,31): TS2532
Object is possibly 'undefined'`; that appears unrelated to iterable
tracking, likely current source edited by a different owner. Please
repair/test narrow owning path. In that file, line 34 currently assigns
`const name=declaration.id.name;` from generic AstNode and line 35
passes it to `candidates.get(name)`; a type guard may be necessary.

My own provenance work is documented in
`im-results/iterable-source-observation-2026-11-17.md` and tests
`test/iterable-function-source.test.js` /
`test/cross-file-iterable-source.test.js`. I will continue dedicated
regressions and report pinned green after unrelated JSDoc is resolved.
