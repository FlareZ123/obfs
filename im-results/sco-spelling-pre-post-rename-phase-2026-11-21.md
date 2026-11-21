# Why the SCO public mask extractor failed after identifier renaming

**Agent 2, 21 November 2026. Status: independently reproduced attack-harness limitation and source-pinned Chromium regression repair.** This concerns byte spelling and honest source-reconstruction evidence, with no change to the obfuscator's encoding or authorized-server policy.

## Original failing assertion

The real-browser fixture test/sco-spelling-mask-browser.js serves a three-string source with one 32-code-unit ASCII anchor and two other literal forms through the genuine SCO HTTP handler. It checks native-versus-SCO UTF-16 behavior, meaningful private-property/binding renaming, and a separate Acorn-only source attacker. In the old harness, the separate extractor was required to reproduce each **entire served source string byte-for-byte** from its 32-bit inferred mask.

That additional assertion failed at test/sco-spelling-mask-browser.js:113 in both [44932800334](https://github.com/FlareZ123/obfs/actions/runs/44932800334) and [44933207667](https://github.com/FlareZ123/obfs/actions/runs/44933207667). The attacker subprocess succeeded and correctly found the first 32-character anchor, but reported its whole-source prediction was not equal to served JavaScript.

## Exact first-difference diagnosis

A diagnostics-only [Chromium run 44933493379](https://github.com/FlareZ123/obfs/actions/runs/44933493379) at source 4e7581128e98e45ea4f883bc0d7e5d6222c8b9be logged the independent subprocess's first divergent byte: **offset 206**, at the first content character of the **second** string literal. The observed source began:

- Served second string: g\u0068ij\u006bl\u006dn\u006f\u0070q...
- Attacker prediction: gh\u0069j\u006bl\u006d\u006eo\u0070...

Using the inferred mask of 32 bits from the first literal, the predicted second string's first 12 literal code units correspond to phase 13 modulo 32. The actual served string matches **12/12** of those bits at phase **11 modulo 32**, exactly a **minus-two** relative shift. The emitted identifier directly before the second string is _v56e3df910f7c (14 characters), where the original source used secondMarker (12 characters). This is an exact explanation for the two-position start-offset mismatch relative to the first anchor.

The compiler sequence in src/sco.js spells each literal using its AST start index **before** calling the core obfuscation pass that renames bindings. The Acorn-only extractor, supplied only the served renamed code, cannot blindly substitute its **post-rename canonical** literal indices for the original pre-rename indices. The first anchor still recovers the 32 selector bits modulo its own position; relative positions of later literals can drift after name-length changes.

This falsifies only the previously overbroad **exact whole-source mask extraction** claim under a concurrently renamed module. It does **not** change the theoretical at-most-32-bit selector bound of the spelling step, which follows from the unchanged indexing formula. The stricter 24-response canonical-double-quote, known-position mask extractor in test/sco-spelling-mask-attack.test.js remains independent and unchanged.

## Honest browser evidence revision

Branch agent2/sco-spelling-mask-diagnostic-20261121 has two bounded changes:
1. sims/sco-spelling-mask-extractor.js emits the first byte of divergence and bounded public-only excerpts when its independently computed source is not byte-identical.
2. test/sco-spelling-mask-browser.js continues to require two distinct SCO responses, true native/browser parity for all UTF-16 units, actual private field and lexical-binding renaming, an independent mask report of 32 bits per served response, **identical public-source canonicalization across the two responses**, and successful execution of that reconstructed program. It explicitly measures exact whole-source mask predictions rather than requiring them where original raw positions were altered.

No production compiler or SCO handler changed.

The real Chromium [green workflow 44934344854](https://github.com/FlareZ123/obfs/actions/runs/44934344854) at exact code source 2bdd3786e582b49c1c71d016dadc4dad9f6ffa10 reported:
- Native-versus-SCO output: **74/74 code units equal**, including an unpaired surrogate.
- SCO output varied across two fresh requests, with **one private property** and **six lexical bindings** transformed.
- Independently predicted complete source spelling: **0/2** in the renamed module, recorded as false without suppressing the measurement.
- Public AST normalization: **identical canonical JavaScript** across fresh responses, successfully executed in a separate Node VM and returned the same original output.
- All remaining Chromium, SCO TLS, piggyback and strict JSDoc workflow steps: **passed**, including the previously blocked check.

The corresponding 24-request exact mask recovery claim remains restricted to its explicitly canonical, known-offset fixture, where it is a meaningful separate attack result. It should not be generalized to arbitrary changed identifier lengths without recovering original offsets.

## Security interpretation

The reported failure is a gap in one source-only attacker's relative-offset assumption. The full browser's public-code reconstruction remains independently demonstrated. The obfuscator's strong protection and 2.5x release criteria remain **RELEASE-BLOCKED**. This patch improves evidence quality and CI reproducibility; it cannot be interpreted as a secure obfuscation enhancement.
