# Frozen COO polyvariant application: source-only rebuilt executable, without protected published functions

**Agent 14, 2026-11-16. Reproducible intermediate negative security result.** This adds a stronger, independent *program-reconstruction* witness to the earlier whole-application public-artifact replay and isolated arithmetic reconstruction experiments. It does not establish universal deobfuscation or security for an unrelated scheme.

## Exact delivered artifact and reconstruction

The frozen public application is [`examples/polyvariant-app/generated/`](../examples/polyvariant-app/generated/): `math.mjs`, `state.mjs`, `entry.mjs`. The compiler selected only three two-branch, signed-Int32 additive functions from the math module; the string-dependent `digest`, state machine, reflection and external `host.emit` behavior remain visible. The original native source is [here](../examples/polyvariant-app/native/) for **verification only**. Earlier [whole-app evidence](polyvariant-app-attack-cost-2026-11-16.md) measured 310 source bytes selected for protection (12.6% of 2,467 original bytes), with 1,635 source bytes in state/entry shipped unchanged and 96 native/generated scenario checks.

The independent [`sims/polyvariant-app-static-clone.js`](../sims/polyvariant-app-static-clone.js) receives only the **published** `math.mjs`. It uses Acorn to find the three exported function declarations and an existing independent [source-only arithmetic AST interpreter](../sims/polyvariant-affine-static-recover.js) to recover equivalent native-form functions. It replaces the emitted branch machinery with freshly generated JavaScript, leaving the public `digest` function intact. The independent [test](../test/polyvariant-app-static-clone.test.js) copies **only** published `entry.mjs` and `state.mjs` plus the newly reconstructed math into a fresh ESM directory, then executes that full application against the original native and delivered public builds. The published protected math machinery is absent from the reconstructed runtime graph. Compilation does not call or instrument the distributed functions, query an oracle, use the original source, load the obfuscator, or know the compiler seed.

Recovered source-only offsets were **round1 +324, round2 +292, round3 +324** (Int32); the decoded three additive functions are algebraically equivalent for the restricted signed-Int32 grammar. This is **not** the exact original nested arithmetic spelling.

## Pinned cross-platform source and behavior

Manual-only [two-platform workflow 43968642800](https://github.com/FlareZ123/obfs/actions/runs/43968642800) passed on Ubuntu and Windows Node.js 22.23.4, including the new executable reconstruction test, existing compiler differential/CLI/fuzz cases, the frozen builder, strict JSDoc, sampled startup/hot/app runtime, and real Chromium on Ubuntu. The **exact executable commit** is `98ba9f0cf55d9617f0488320dfbcc0b9c0ec9ea5`.

| Metric | Ubuntu | Windows |
| --- | ---: | ---: |
| Recovered protected exported functions | 3/3 | 3/3 |
| Typed source-native / published / rebuilt comparisons | 12,288 | 12,288 |
| Whole-application native / published / rebuilt sessions | 96 | 96 |
| Stateful events across those sessions | 1,168 | 1,168 |
| External callback traces and JSON state/reflective outputs | 96/96 matched | 96/96 matched |
| Published math bytes read by attacker | 5,883 | 5,905 |
| Rebuilt math source bytes | 727 | 749 |
| Single test-run source-only parse/rebuild measurement | 21.421 ms | 30.839 ms |

The 22-byte Linux/Windows source-size difference is attributable to platform checkout newlines. The CLI separately measured **17.4 ms Ubuntu / 29.387 ms Windows** on the same sources. Each attacker parse value is one process sample, **not** a human/LLM effort estimate or a credible population confidence interval.

The source-wide full-session benchmark in the same workflow performed seven alternating fresh three-file ESM imports, including event processing and external host callbacks. Its native-to-published median ratios were:

| Events per fresh app lifetime | Ubuntu | Windows |
| ---: | ---: | ---: |
| 1 | 1.280× | 1.164× |
| 50 | 1.413× | 1.357× |
| 1,000 | 1.366× | 1.454× |
| 10,000 | 1.344× | 1.230× |

All eight sampled ratios are under the requirement's 2.5× bound **on these selected workloads**. The baseline is the native full application, and the timed protection is the delivered public application, not the attacker's reconstructed clone. Files are materialized outside the timer, consistent with out-of-band COO deployment; import, parse, event handling and host callbacks count. Browser network latency and general workload coverage remain unmeasured. Importantly, most application bytes were never obfuscated, which helps end-to-end performance despite larger protected function overhead.

## Security decision

The test now supplies constructive **native-form recovery of the genuinely transformed leaf functions and independent executable replacement inside the entire published application**. It is stronger evidence than byte-for-byte package copying or simply invoking exported public functions. It breaks the tested polyvariant source-hiding hypothesis under a source-only attacker and matches caller-visible semantics for the specified finite corpus.

It remains a **tailored reconstruction** of a known two-branch additive grammar, and copies unrelated visible application logic from the distributed package; it does not restore the exact original nested arithmetic AST, cover arbitrary ECMAScript dynamic behavior, or measure resistant alternative schemes. A capable owner of a public COO distribution could also replay the original bytes trivially. No client-side tamper or environment lock survives the prescribed full-control attacker. The whole-application 2.5× samples cannot establish stronger security or a universal speed guarantee.

**Decision:** keep polyvariant affine opt-in as a syntactic diversity experiment, with bounded semantic/performance evidence. The positive protection hypothesis fails this independent public-source rebuilding test. Future proposals must protect a substantial share of selected work and increase the cost of comparable reconstruction over a minified/native baseline without violating full-session performance.
