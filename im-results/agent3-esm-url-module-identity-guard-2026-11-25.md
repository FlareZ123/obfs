# ESM URL module identity versus POSIX path normalization

**Status:** Intermediate finding; implementation and focused tests added, complete validation pending.

## Finding

A relative ESM specifier containing repeated path separators can be interpreted differently by WHATWG URL resolution and `path.posix.normalize`. The difference is not merely that two spellings can produce distinct module-map keys: repeated separators can change which physical input file is selected when followed by a parent segment.

Reproducer:

```js
new URL('./a//../state.mjs', 'https://host/app/main.mjs').pathname
// '/app/a/state.mjs'

path.posix.normalize(path.posix.join('app', './a//../state.mjs'))
// 'app/state.mjs'
```

Node ESM uses URL-style resolution for relative module specifiers in this case. A fixture with `state.mjs` exporting `{secretField: 23}` and `a/state.mjs` exporting `{secretField: 42}` resolves the import to the latter. A cross-file property proof that uses POSIX normalization can instead attribute the import to `state.mjs`.

The first red-first focused check on the candidate branch admitted one cross-file property rewrite where the conservative expected result was zero. The fixture was then corrected to use the repository's `main.mjs` test entrypoint; the native URL-resolved result was 42. The proof must not use POSIX normalization as an ESM module-identity oracle.

## Implemented conservative boundary

Repeated-separator ESM specifiers are now rejected by graph proofs that previously normalized them as POSIX paths:

- `src/cross-properties.js`: `resolveImport` returns no resolved module for specifiers containing `//`, causing the closed-world graph admission to fail closed.
- `src/source-observer-islands.js`: `resolveKnownImport` rejects the same spelling rather than admitting an island based on a different module identity.
- `src/core.js`: complete host-lock graph admission, statically imported ESM target discovery, and unproved ESM import detection all reject repeated separators. CommonJS `require` resolution was not changed because its intended resolution model is Node's path resolver.
- `src/cli.js`: SCO public-file selection rejects empty path segments before POSIX normalization. Its HTTP route uses URL pathname semantics, so selecting a different normalized file could otherwise omit the actual browser dependency.
- `src/sco-graph.js` and `src/sco-selective-partition.js` already require the original relative specifier to equal its canonical spelling; repeated-separator variants are already rejected there.

This is intentionally conservative: canonical relative imports remain eligible, while ambiguous spellings lose cross-file proof, source-observer-island admission, host-lock completeness, string-decoder admission, or SCO public-graph admission as applicable.

## Regression coverage added

- `test/cross-file-reader-flow.test.js`: query-distinct imports cannot be grouped with canonical imports; a dot-segment/repeated-separator import is refused.
- `test/esm-observation-browser.js`: actual network-served Chromium cases verify distinct module instances for `./state.mjs` versus `.//state.mjs`, and verify that `./a//../state.mjs` resolves to `a/state.mjs`, not `state.mjs`. The expected browser result is preserved without a property rewrite.
- `test/source-observer-islands.test.js`: a repeated-separator import cannot establish a closed source-observer island.
- `test/closed-graph-host-lock.test.js`: a repeated-separator dependency cannot establish complete host-lock coverage.
- `test/decoder-unknown-static-esm.test.js`: an ambiguous ESM dependency that mutates `String.fromCharCode` prevents ambient decoder injection.
- `test/sco-client-exposure.test.js`: the SCO CLI refuses a repeated-separator path that could select a different URL-resolved dependency.

## Validation receipts

- Focused cross-file suite: run [45643923501](https://github.com/FlareZ123/obfs/actions/runs/45643923501), success on Ubuntu and Windows, including strict project, external, and budget-evaluator JSDoc.
- Focused SCO client-exposure suite: run [45646402687](https://github.com/FlareZ123/obfs/actions/runs/45646402687), success on Ubuntu and Windows, including strict JSDoc.
- Full manual validation on the cross-file/browser guard revision: run [45644168811](https://github.com/FlareZ123/obfs/actions/runs/45644168811). The Chromium ESM matrix reported 11 cases with native/emitted browser parity. The full behavioral suite remained red with 12 common failures and one additional transient Ubuntu live-RPC fetch failure. This run predates the later source-island, host-lock, decoder, and SCO CLI guards.
- Full manual validation including all graph-consumer guards: run [45646586287](https://github.com/FlareZ123/obfs/actions/runs/45646586287), exact tested head `7b9a1ba90bb4d4bbfd22eafc725e392eb26278db`. The suite reported 5,398 tests on each platform: Ubuntu 5,361 pass / 12 fail / 25 skipped; Windows 5,352 pass / 12 fail / 34 skipped. The 12 failures on both platforms are the same pre-existing baseline failures recorded in the sibling-root report; none of the added path-identity regressions failed. Ubuntu also passed the existing 22-case browser integration, 64-case verified-record Chromium matrix, and the 11-case ESM observer Chromium matrix (`nativeBrowserParity:true`). Project, external, affine-oracle, and paired-budget JSDoc/typechecks passed. All benchmark ratios were within 2.5x (largest listed ratio 1.265x); the verified-record session profile peaked at 1.025x and local-parameter profile at 1.021x.
- The report commit itself is documentation-only; the validated code/test tree is unchanged from the tested head.

## Remaining limits

This finding does not establish that every possible ESM identity ambiguity is closed. Import maps, custom loaders, symlink-backed deployments, server-specific URL routing, and arbitrary external module resolution remain separate constraints. The guard only closes the concrete repeated-separator/POSIX-normalization mismatch found here.

This is an intermediate implementation and validation record, not an established academic result and not release authorization.
