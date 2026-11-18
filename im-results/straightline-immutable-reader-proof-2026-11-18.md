# Straight-line immutable readers: bounded positive yield under cross-file and hot CPU controls

**18 November 2026, Agent 8. Classification: intermediate compiler-compatibility evidence.** This is a narrow semantics/yield result, without a demonstrated source-reconstruction or runtime-tamper security advantage.

## Candidate and initial refusal

An owned local immutable record may be consumed by function declarations and immutable arrow/function expression helpers. The prior `src/properties.js::proveLocalObject` admitted an expression-body immutable reader `const read = owner => owner.privateKey`, but it declined an equally direct two-statement immutable reader:

```js
const root = { secretAlpha: 23 };
const read = incoming => {
  const value = incoming.secretAlpha;
  return value;
};
module.exports = read(root);
```

The function never returns or leaks the owner and only one property read occurs. A correctly inferred alias remains available for internal rewriting when **all** observed calls have the same proven owner.

The initial two-OS [pre-repair workflow 44244101165](https://github.com/FlareZ123/obfs/actions/runs/44244101165) pinned source `575d459748b73b0bda6feff3b1e849e8da78fe65`, and correctly returned `metrics.objects=0` on the expected-positive two-statement helper. The same source's *named function declaration* positive passed once each declaration used a distinct formal spelling. A separate negative fixture with the same lexical formal name `owner` in two separate functions still conservatively declines, exposing a global name-based rather than scope-separated proof bound. Its remaining individual negative cases passed both operating systems.

## Narrow proof extension

`src/properties.js` now recognizes a two-statement block inside a uniquely bound, immutable, synchronous arrow or function expression when:

1. It first declares exactly one `const` initialized by one member access through a named parameter.
2. Its sole remaining statement directly returns that same local binding.
3. The member name is statically known.
4. The existing full-file call-site, parameter alias, no-escape, source-observer, own-key and mutation proofs succeed.

The same pre-existing proof handles all owner-call associations, alternate owners, function-ref escapes and ambiguous parameter bindings. The compiler preserves the input if any condition fails. This admits the straight-line helper without a new VM or an interpreted hot loop.

The independent `test/function-declaration-reader-proof.test.js` runs six Node test groups: named declaration readers across modes and seeds; real three-module ESM call graph execution; two-statement immutable arrow/function expression positives; deliberate duplicate-formal refusal; external-owner mixed call refusal; and source-observed/export-escaped function refusal. It asserts actual private-field rewrite counts and native/generated output parity, avoiding an identity-transform false positive.

## Cross-platform reproduction and measured hot CPU

[Focused workflow 44245584681](https://github.com/FlareZ123/obfs/actions/runs/44245584681) completed **green on Ubuntu and Windows** at exact source `3582f14bf707618cfa07f44373b4d028191987f6`. The new property test groups passed 6/6 on both runners. The same workflow also passed 39 host-source/island tests, external host-callback refusal, a real Chromium source-island probe matrix and both strict JSDoc configurations.

The separate `sims/straightline-reader-profile.js` emits a genuine one-field-rewritten COO CommonJS helper, compares 2,049 distinct input values, warms both native/compiled functions and executes 16,000,000 selected calls per variant in each of 11 counterbalanced CPU-measured pairs. It excludes compilation, CJS context construction and COO cold startup; those boundaries must be benchmarked independently.

| CPU selected hot work | Ubuntu Node 22 | Windows Node 22 |
| --- | ---: | ---: |
| Native source bytes | 174 | 174 |
| Emitted source bytes | 178 | 178 |
| Own-field rewrites | 1 | 1 |
| Paired trials | 11 | 11 |
| Protected/native ratio of medians | 1.00083998x | 1.00000000x |
| Maximum paired slowdown | 1.00767959x | 1.01282051x |
| Strict paired observations >2.5x | 0/11 | 0/11 |

The exact Ubuntu native CPU samples in milliseconds were `[75.004,75.684,75.942,75.002,74.897,76.322,75.074,74.710,74.626,74.482,74.644]`, and generated samples were `[75.580,74.720,75.918,75.571,75.065,74.699,75.342,74.865,75.115,74.422,74.299]`. Windows CPU samples were integer-millisecond quantized; source-pinned raw data are printed as `STRAIGHTLINE_READER_CPU` in both job logs.

This observed warm-work budget result is descriptive. It gives no universal 2.5x runtime guarantee or evidence about all branch distributions.

### Cold/startup-inclusive paired CPU revisits

The independent `sims/straightline-reader-cold-profile.js` runs original and emitted CJS modules in fresh Node child processes, measuring child CPU from process startup through module loading and 1, 10,000 or 8,000,000 business calls. Each workload has nine counterbalanced native/compiled pairs per OS. This benchmark excludes the offline compiler/build, consistently with COO pre-distribution, and includes startup.

- [Pinned run 44246136923](https://github.com/FlareZ123/obfs/actions/runs/44246136923) at `0c5e41839b4f9184c6ddf1692cf45c5de6b15cb6`: **0/27** paired >2.5x observations on each OS. Ubuntu median ratios per workload were 0.96122x / 0.99270x / 1.00070x; Windows ratios were 1x / 0.96774x / 0.75410x.
- [Later run 44246436097](https://github.com/FlareZ123/obfs/actions/runs/44246436097): Windows observed **3/27** paired >2.5x CPU comparisons, including ratios 4.13333x at one call and 3.06667x at 10,000 calls. Windows quantization was 15ms increments and startup scheduling varied markedly.
- [Later run 44246644729](https://github.com/FlareZ123/obfs/actions/runs/44246644729): Windows observed **1/27** paired >2.5x, at 10,000 calls (maximum 2.56667x).
- [Later run 44246837317](https://github.com/FlareZ123/obfs/actions/runs/44246837317): Windows observed **1/27** paired >2.5x at one call (maximum 3.06667x).

These strict observed violations **cannot be overwritten by the earlier clean run or passing medians**. Scheduling and CPU accounting jitter prevent attributing such short-startup ratios causally to the four-byte naming change, but the project does not possess a strict startup-inclusive 2.5x guarantee. The broader strong-protection release remains blocked.

A source-pinned [byte-identical native/native fresh-process placebo](straightline-identical-cold-placebo-2026-11-18.md) subsequently observed **4/108 strict >2.5x Windows CPU ratios without any transform**, compared with **2/108** original/emitted ratios over the same three executions; both arms saw 0/108 on Ubuntu. Thus individual cold-process sampled threshold crossings are insufficient to attribute the slowdown to the four-byte key rewrite. This finding does not erase the candidate's recorded breaches or establish the universal performance budget.

### Equal-trust conventional minifier and public-source adversary

The independently executed `public-only source normalization retains a functional clone beside an ordinary minifier` Node test uses esbuild minification as its conventional same-function control and `normalizePublicIsland` as a seedless attacker consuming only the published generated source. It finds the single hashed own-field label without knowing the original key or obfuscation seed and rewrites it consistently. All three functional variants (minified, generated, public-normalized) match the native reader over **513 inputs** on Ubuntu and Windows in [run 44246436097](https://github.com/FlareZ123/obfs/actions/runs/44246436097) despite a later independent cold-CPU test failure.

| Artifact | Bytes |
| --- | ---: |
| Native frozen CJS | 174 |
| esbuild conventional minified CJS | 96 |
| Obfuscated CJS | 178 |
| Seedlessly normalized obfuscated CJS | 200 |

The minifier control is meaningfully smaller; the delivered obfuscated implementation and independent normalized copy are both functional public-source clones. This dataset establishes **no incremental reverse-engineering resistance** over minification. It tests one simple helper only; it is neither a universal deobfuscator nor a security lower bound for other classes.

## Security decision and unresolved work

Changing a private spelling under exactly proved ownership is syntactic obfuscation. The program is available to a full-control COO/SNO adversary, and no matched attacker/minifier study here demonstrates a reconstruction-cost advantage. The 4-byte emitted-code expansion in this one-field fixture is packaging data only. Thus this improves safe transformation coverage under a restricted source-compatible proof, not the repository's overall security release verdict.

An independently reproduced, more severe public-contract counterexample revealed that **directly exported immutable callable helpers** could be transformed despite unknown callers. Its repaired COO/SCO/SNO differential, which retains external host behavior by declining the rewrite, is documented in [exported-reader-host-contract-2026-11-18.md](exported-reader-host-contract-2026-11-18.md).\n\nThe current proof still conservatively refuses duplicate formal names in independent function scopes; a properly scope-keyed owner/parameter identity map could increase positive yield, but would require nested-scope, shadowing and hostile-callback differential tests before admission. An equally important outstanding boundary is the external host's ability to observe source through undeclared effects. The separate source-island host-callback study documents that independent assumption. More aggressive recognition should remain behind a precise semantic proof and an independent static adversary control.
