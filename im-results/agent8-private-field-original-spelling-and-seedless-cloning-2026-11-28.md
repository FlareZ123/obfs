# Agent 8 intermediate evidence — original property-name recovery, private salts, and seedless cloning

**Recorded:** 28 November 2026 UTC. **Status:** reproducible intermediate research, not an established confidentiality or release result. **Owner:** Agent 8. All named CI receipts use source-pinned artifacts; they are not aggregate descriptions of unrelated branch heads.

## Research question

When the compiler replaces a statically proved JavaScript own-property name with a compact deterministic digest, can an independent adversary recover the **original spelling**, rather than simply rewrite the output to an equivalent new spelling? Does keeping the digest salt private change that conclusion, and does it prevent functional reconstruction? Those are **different security questions**.

The tested compiler source is the main-branch implementation at the recorded branch base (853197610e48ed94db3dd865b5f5b20d77f7ac51). The attack targets exactly two schemes in src/cross-properties.js and src/properties.js, not arbitrary obfuscation.

## Exact-original-name dictionary experiment — proven negative result for public seeds

Independent attack and native ESM/CommonJS regression:
- [Attack implementation at source commit a6525c3](https://github.com/FlareZ123/obfs/blob/a6525c3cf04862d9cd3cd69b51acb56de1715561/sims/public-seed-property-dictionary.js)
- [Original-name recovery tests at source commit a6525c3](https://github.com/FlareZ123/obfs/blob/a6525c3cf04862d9cd3cd69b51acb56de1715561/test/agent8-public-seed-property-dictionary.test.js)
- [Ubuntu and Windows success, CI 46142149443](https://github.com/FlareZ123/obfs/actions/runs/46142149443)

The attack reads *only emitted source*, a 4,099-word property-name vocabulary containing the three true names, and an **explicitly known public deterministic build seed**. It never reads the obfuscator's original program, generated source offsets, the private repository, or a runtime oracle.

| Emitted owner | Actual renamed fields | Original spellings recovered | SHA-256 guesses | Source-only attack wall time, Ubuntu / Windows |
|---|---:|---:|---:|---|
| named ESM export | 3 | 3 | 4,099 | 16.85 / 19.82 ms |
| anonymous default ESM export | 3 | 3 | 4,099 | 5.91 / 8.22 ms |
| local CommonJS object | 3 | 3, plus original byte offset 26 | 1,049,344 | 862 / 1,565 ms |

Both published compiled programs and AST-reconstructed original-spelling programs matched native Node loader stdout, exit status and stderr. All three outputs had a positive proof that the compiler had actually renamed 3 fields; this is not a vacuous no-rewrite observation. Incorrect public seeds recovered 0 names. Removing one true dictionary entry recovered 2 of 3. A local source-offset window ending before the real offset recovered 0.

**Precise scope:** the public-seed assumption is essential, and the vocabulary must contain the sought original names. A fresh cryptographically secret build seed defeats these specific dictionary guesses. The results do not establish original-name recovery of all JavaScript, encrypted code, or semantic formula recovery.

## Independent compatibility and real-browser controls

[Host-visible carrier matrix commit 668f499](https://github.com/FlareZ123/obfs/commit/668f499828afd7e8dffd09e2440712048d5b1f69),
[CI 46141604882](https://github.com/FlareZ123/obfs/actions/runs/46141604882):
40 carrier expressions times three COO/SNO/SCO core-mode configurations =
120 actual native-vs-compiled Node ESM comparisons. All 40 suspicious owner carriers in each mode were **conservative refusals with zero own-field rewrites**. A separate true-positive safe graph rewrote 2/2 fields. In Chrome 158, 14 selected three-module graphs ran under strict self-only script CSP and connect-src none, with an *external host callback installed outside compiler inputs*, a nonvacuous two-key protected positive control, and 89 actual HTTP ESM GET requests. A fetched ESM CSP probe, not a privileged DevTools eval, verified string eval was blocked. This is behavioral safety evidence, not protection yield on refused graphs.

[Source-only Webcrack strict-CSP experiment commit 4ce994d](https://github.com/FlareZ123/obfs/commit/4ce994dc77a33b051b95240c96aee1c2adee3d5b),
[CI 46141349379](https://github.com/FlareZ123/obfs/actions/runs/46141349379):
two independently reconstructed delivered three-module graphs matched full stateful results and external callback traces over five workloads of 1, 17, 50, 1,000 and 10,000 events under a real browser CSP that blocked ordinary module eval. This independently reinforces that syntax diversification does not prevent source-only *functional* cloning in those fixtures. It is not recovery of original mathematical formulas or proof of a runtime-independent attack.

## Private-property salt — narrow mitigation and explicit counterattack

An isolated, **opt-in** core compiler experiment derives field names from a fresh private CSPRNG salt, separate from the public deterministic build seed. The owner proof and actual runtime field operations are unchanged. This test is not included in the frozen production release candidate.

- [Core implementation and private-salt tests at f37b0e9](https://github.com/FlareZ123/obfs/commit/f37b0e9e5fa828121e85f7349ade94b32eaf6cb6)
- [Two-platform CI 46142382049](https://github.com/FlareZ123/obfs/actions/runs/46142382049), three core mode labels + local CommonJS: 3/3 actual protected fields, zero known-public-seed name matches under the private salt, identical native program outputs, identical target byte lengths, different field names across builds, private salt absent from metadata.
- [Seedless static normalizer at dee7838](https://github.com/FlareZ123/obfs/commit/dee78387d282a94b130f0fa39438f558ff565a1d) and [counterattack tests at 21dbd5a](https://github.com/FlareZ123/obfs/commit/21dbd5a13952af72a84d3170eb1082e617efe8c7), [green two-OS CI 46142739816](https://github.com/FlareZ123/obfs/actions/runs/46142739816).

The seedless counterattack requires no original source, private seed or runtime oracle. It replaces consistent emitted digest tokens with unrelated stable neutral names in all supplied public files, then executes the reconstructed native ESM/CommonJS graphs with exactly matching stdout, exit status and stderr. It rewrote all 3 private fields in each tested mode. The attack is deliberately **bounded to statically named ordinary owner graphs**: globally replacing arbitrary source strings is not a general JavaScript deobfuscator and could corrupt unrelated observable strings.

This establishes a sharp distinction: **original private field spellings** become harder to infer with an undisclosed salt, but **functional cloning** of the published examples remains trivial. No claim of tamper resistance, authorization, incremental attacker cost versus equally trusted minified code, or strict runtime performance compliance follows. Nonreproducible build hashes and source/SRI observers are real deployment costs.

## Open acceptance questions

1. The opt-in reusable secret-key variant, CLI adapters, strict-CSP reconstructed-browser test, and warmed process-CPU experiment on branch [agent8/private-property-entropy-20261128](https://github.com/FlareZ123/obfs/tree/agent8/private-property-entropy-20261128) require separate final CI receipts; branch-head source changes must not be attributed to earlier success runs.
2. Re-test with a frozen six-module application and a credible equal-trust esbuild baseline before claiming material protection. The original source-observing frozen application currently yields **zero** protected private fields under default settings, so new isolated owner fixtures are not substitutes for its release acceptance.
3. SNO adversaries control their Node process/filesystem/memory; COO adversaries control their entire browser and delivered files; SCO has a genuinely separate server trust boundary but unbounded legitimate-request oracles. Do not promote per-build private field-name secrecy to a generalized strong-obfuscation result.
4. A universal 2.5x compute guarantee is not established by any of these bounded tests.

**Disposition:** retain in im-results; do not advertise in results/README.md as a publishable or release-qualified breakthrough. Preserve the frozen PR384 NO-GO and independently validate stronger proposals against its exact source-pin, attacker and performance controls.
