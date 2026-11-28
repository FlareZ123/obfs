# Frozen PR #384: independent Webcrack source-only math reconstruction / native-ESM behavior control

**28 November 2026, Agent 8. Classification: intermediate adversarial evidence, not a security-positive candidate or original-source reconstruction.**

## Exact immutable comparator

- Frozen production source: [PR #384, `a8a22f9aef6e7f0d487cebc23c87063376df55cb`](https://github.com/FlareZ123/obfs/commit/a8a22f9aef6e7f0d487cebc23c87063376df55cb).
- [Independent audit source, commit `8ef0d0973f36e3757f2819eb63a34211717b03ae`](https://github.com/FlareZ123/obfs/tree/agent8/pr384-webcrack-source-external-20261128): `sims/webcrack-four-way-attacker.js`, `.github/workflows/manual-minified-control.yml`; audit branch does **not** change frozen `src/`, `bin/`, `examples/`, `test/`, `package.json` or `package-lock.json`. CI checks this exact invariant with full-history `git diff --exit-code`.
- [Source-pinned two-OS Actions run 46115860740](https://github.com/FlareZ123/obfs/actions/runs/46115860740), **success Ubuntu and Windows** (Node 22.23.5). External `webcrack@2.16.0` npm no-save, no-lock dependency; exact CJS entry SHA-256 `bce44c58372544070defbb8a48063cf149a116e9560e2a489d180766b68983fd`; external package.json SHA-256 `df3519fc0490c6740de85dbcc21a7328bf39faba2f23341a9f342a5c74d1ddef`. Production project lockfiles are never modified.
- Archived **Webcrack-Linux** and **Webcrack-Windows** artifacts each contain the complete JSON audit record and the exact deobfuscator-emitted `minified-math.mjs` and `published-math.mjs`. Also archived whole-application Node/Chromium/cross-runtime controls. Separate artifact hashes and input/output source SHA-256 make byte-for-byte reproduction checkable.
- Tool operates on the **published math module bytes only**, with `deobfuscate:true`, `unminify:true`, `unpack:false`, `jsx:false`, **no source execution in the transformer**, no original code, server oracle, or debugging instrumentation. The test harness imports the emitted ESM afterward to verify behavior; this is necessary to distinguish a plausible looking transform from an executable one. `webcrack` is an off-the-shelf independent tool; no adaptive scripts/known formulas are supplied to it.

## Cross-platform comparable observations

Both OS reported the same input bytes and SHA-256, output bytes and SHA-256, zero equality mismatches and true heldout full-app output/host-trace parity:

| Variant | Input bytes | Input SHA-256 | Deobfuscator output bytes | Emitted SHA-256 | Callable public exports | Typed exact math comparisons | Full app result | External host trace |
|---|---:|---|---:|---|---:|---:|---|---|
| Exact ordinary minification | 377 | `d783d9e978ecbc18af1fe41f44cb59801732ec72310e55934714d547eae77094` | 550 | `eca85c19f4abe82fd4b903abccdca0f9dd5b95a5329c587e7c0fdd3fa2ee9013` | 3 | 12,288/12,288 | equal | equal |
| Published protected math | 5,863 | `907553405e14dd2cd1d2977b98de19bfc3412b2ed6ee811e8b66cf3541072c79` | 7,342 | `f613a3944b04c2126f0fd2972ff0a3fa2f99ed0b7e4fed16db929c354e33fbd3` | 3 | 12,288/12,288 | equal | equal |

Input corpus: each public `round1`, `round2`, `round3` compared on 4,096 integer inputs, including signed 32-bit extrema, negative zero, and deterministically multiplied perturbations, checked using `Object.is` instead of stdout coercion. Additional *full real* three-file ESM graph reconstruction replaces only the transformed math dependency and retains the same state/entry modules; 17 deterministic mixed-event actions, including Unicode, are run against the untouched native graph. The application return and the opaque external `emit()` callback sequence both match exactly (one fixed trace, not a general-purpose contextual-equivalence proof).

**Oracle mutation control:** a deliberately changed native `round1` returns a **string** with the same printed digits as the original number. A lossy console/string comparison accepts it, but this audit's `Object.is` rejects it. The mutation control passed on both operating systems. This prevents one easily misleading class of green test.

## What this result does and does *not* establish

**Established under this narrow test:** an independent off-the-shelf deobfuscator can transform the self-contained published math bytes into **executable, standalone public-math clones** passing the same fixed typed-return and full-app trace oracles as ordinary minification. Source code remains public and includes its functional entry points. The deobfuscator result is not merely formatted text that crashes at runtime.

**Not established:** recovery of the *original source formulas* (explicitly reported `staticOriginalFormulaRecovered: "not measured"`), a security advantage or disadvantage **beyond** this fixed test, integrity or domain-lock bypass, resilience to instrumented browser analysis, context-sensitivity under arbitrary host callbacks or source observation, anti-LLM performance, binary/bytecode reconstruction, or CPU-budget compliance. A clone that passes tests is distinct from original source recovery. The comparison also does not infer equivalence for all possible inputs (finite corpus).

**Selection significance:** both published protected output and ordinary minification remain executable after **the same** static third-party transform. This offers **no demonstrated incremental static protection** relative to the matched minifier. The repository's existing stronger source-only chosen-query/clone test and adversarial protocol tests independently reject strong-protection promotion; this test supplies a previously missing third-party reproducibility check and explicit full-graph oracle, not a new release verdict.

## CI evidence and reproducibility limits

The first two attempts were **harness failures** rather than evidence about obfuscation: shallow checkout could not compare the frozen source commit, and `npm install --omit=optional` broke the required platform-specific `esbuild` native binary. Commits prior to `8ef0d097` fix full git history and preserve optional deps; the final two-OS run passed. Do not count aborted or harness-broken runs as candidate correctness failures.

The run also exercises pre-existing equal-trust static and full Node/Chromium perf decision controls, but this report's new finding is exclusively the third-party attacker-plus-native-ESM fixed oracle. Whole-app comparison and external tool output are archived per OS and content-addressed. Follow-up should inspect the emitted source against a **predeclared original-formula recovery** metric, or design an unknown-source hostile-host trace. A larger test count is not a substitute for selecting a credible incremental advantage.

Related parallel evidence: [Agent 3's separate pinned Webcrack math-only two-OS run 46113727829](https://github.com/FlareZ123/obfs/actions/runs/46113727829) passed identical 3×4,096 return comparisons but did not include this audit's native-ESM full three-file host trace and mutation control. Both are independent and converge on the same narrow observation; do not count them as two distinct protection breakthroughs. **PR #384 remains RELEASE-BLOCKED.**
