# Parsed cross-file ESM AST cache: exact-source replay (2026-11-23)

**Agent 25. Status:** reproducible, bounded build-time optimization integrated in `main`. This is an engineering performance/compatibility result and remains in `im-results/`, outside academically established confidentiality findings.

## Scope, control, implementation

Replayed Agent2's previously unmerged [PR127](https://github.com/FlareZ123/obfs/pull/127) in isolated branch `agent25/pr127-parse-cache-replay-20261123` against current pre-change main source `cdea290cf40897fcc5385d4fd3d8fbd93f053fd2`. The original benchmark `sims/cross-file-parse-ab.js` was copied exactly from historical PR code, then its source-control SHA was updated to the live unchanged compiler baseline and two JSDoc annotations were corrected under strict external typechecking.

The main functional change in `src/cross-properties.js` is an **invocation-local WeakMap** of immutable `AstNode` and binding counts keyed by a source-file object and its current source value. Five independent closed-world ESM verification collectors accept an optional callback from the rename invocation, avoiding repeated parsing of the same unchanged files. Their one-argument exported behavior continues to use an independent fresh parse. The cache is discarded after the compiler invocation. No emitted runtime payload, protected runtime operation or attack surface is added.

Curated [integration commit `e066e9f969e9b05decb80d343598af9405be9418`](https://github.com/FlareZ123/obfs/commit/e066e9f969e9b05decb80d343598af9405be9418) preserved four files: source implementation, exact source-controlled A/B script, strict external JSDoc enrollment, and an opt-in manual workflow that performs full Git history checkout **only when `parse_ab=true` is explicitly dispatched**. Default manual workflow behavior is unchanged. The test script swaps source files atomically with a per-workflow exclusive lock inside a detached CI checkout, restores the compiler source in a `finally` block, and asserts the current source differs from the frozen control.

## Exact same-source A/B with behavior proof

The tool launches alternate fresh Node compiler processes for matched control and candidate source in each of four closed-world multi-file ESM graphs:

- `esm`: three modules, imported identity/readers, **2** successfully renamed owner properties
- `esmkey`: three modules, imported literal computed key, **1** renamed property
- `esmgraph8`: eight independent owner+reader modules, **8** renamed properties
- `esmgraph32`: 32 independent owner+reader modules, **32** renamed properties

For every graph on both Linux and Windows, the A/B runner asserted identical serialized emitted-code SHA-256 hash between control and cache, equal rename counts and equal resulting native/emitted ESM console outputs. Hash-prefixes per graph were `4e86ff65f2`, `9bce992fa8`, `07abbd4732`, `51d8ba09a9`, respectively. These hashes are observational byte identities for tested graphs, not a general mathematical equivalence proof.

Full two-platform workflow [45102959853](https://github.com/FlareZ123/obfs/actions/runs/45102959853) passed source-pinned opt-in A/B, existing full cross-file differential and host-lock tests, Chromium host checks on Ubuntu, and strict external JSDoc after corrections. Source `26d791915a28661028d7275d30f4860ba975f0f7`. Prior [45102809400](https://github.com/FlareZ123/obfs/actions/runs/45102809400) reached and passed source-matched A/B and normal tests on both OSes but later **failed** two preexisting benchmark-file JSDoc annotations; fixed and revalidated in 45102959853.

The table reports two independent complete runs as **control/cache ratios** in the whole `obfuscateFiles` build window, with ratios above 1 denoting the cache faster. These are finite noisy observations, especially Windows CPU tick quantization:

| Graph | Linux wall run1 / run2 | Windows wall run1 / run2 | Linux CPU run1 / run2 | Windows CPU run1 / run2 |
| --- | --- | --- | --- | --- |
| 3-file identity/readers | 1.054 / 1.032 | 0.963 / 9.101* | 1.050 / 1.038 | 0.492 / 0.492 |
| 3-file imported literal key | 0.937 / 0.979 | 1.037 / 1.052 | 0.895 / 0.971 | 1.469 / 0.660 |
| 8 owners | 1.067 / 1.065 | 1.065 / 1.094 | 1.187 / 1.220 | 1.574 / 1.445 |
| 32 owners | 1.013 / 1.059 | 1.050 / 1.065 | 1.013 / 1.075 | 0.966 / 0.693 |

* The extreme `9.101×` Windows three-file wall sample is a startup/scheduling outlier. This value **must not** be represented as a real ninefold compiler throughput gain. The other measurements are mixed, with larger 8-/32-owner graphs showing approximately 1.3–9.4% wall-clock improvement on these runs. **No generalized throughput guarantee or regression-free statement** is justified by this sample. The optimization doesn't modify the emitted protected runtime, so its build-time gains or losses do not enter the runtime 2.5× requirement.

Additional focused two-OS pre-integration checks at source `fda018bd976ae56394f96166bea5d38c63e3b928`: [identity-grid 45102609751](https://github.com/FlareZ123/obfs/actions/runs/45102609751) and [source-introspection 45102613763](https://github.com/FlareZ123/obfs/actions/runs/45102613763) passed. The initial requested `test/cross-file-reader-grid.test.js` path did not exist in this repository, so [45102605848](https://github.com/FlareZ123/obfs/actions/runs/45102605848) was red at test discovery, unrelated to source correctness.

**Limitations:** all four cases use static, finite, mostly acyclic ESM graphs and the current Node 22 parser/toolchain. The output bytes and expected values were proved only for this battery. A hostile `WeakMap` or parser constructor, reflective mutation of source objects, cross-invocation state, and arbitrary metaprogramming are outside this benchmark; ordinary program runtime protections remain release blocked. The strong-protection verdict remains **RELEASE-BLOCKED** under the overarching SCO/COO/SNO threat models.

## Main integration verification

Full opt-in main-source A/B + cross-reader workflow [45103256547](https://github.com/FlareZ123/obfs/actions/runs/45103256547) and focused main identity-grid [45103260483](https://github.com/FlareZ123/obfs/actions/runs/45103260483) were dispatched after the integration. Their exact source pin and results should be appended once verified independently.
