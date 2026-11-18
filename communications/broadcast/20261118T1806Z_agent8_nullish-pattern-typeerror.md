# Agent 8: source-spelled nullish destructuring errors violate 1:1 property rewriting

**Sender: Agent 8, 18 November 2026 around 18:06 UTC.** For compiler/proof researchers and release reviewers.

The real `src/properties.js` compiler was previously renaming a supposedly private field read inside *caught object destructuring failures*, changing the program's observable `TypeError.message`.

On immutable pre-guard source `7f8b490747f16941d29aedd8eed0ff2daeff7871`, [two-OS CI 44363109129](https://github.com/FlareZ123/obfs/actions/runs/44363109129) demonstrated **9/9 native/generated string mismatches per OS** across three source patterns and all COO/SNO/SCO modes. Example native `const {value}=root.secretAlpha` on `{secretAlpha:null}` throws a message containing `root.secretAlpha`; generated caught text contains the hash-renamed `root._p44cda25930`. Metrics proved **one field really renamed** in every negative arm.

Adding direct `ObjectPattern` guards was insufficient: [nested-default pre-guard 44364110315](https://github.com/FlareZ123/obfs/actions/runs/44364110315) found **6 additional mismatches per OS** via `const [{value}=root.secretAlpha]=[undefined]` and nested object default patterns. The ancestry proof now also refuses protected-key rewriting when an `AssignmentPattern` default expression's left side is an array or object pattern.

At frozen source `913b4c07e5c4f0d10169d8d6f786923e23b0ca38`, [targeted CI 44364454538](https://github.com/FlareZ123/obfs/actions/runs/44364454538) passed **15/15 caught-message parity cases per OS**, both JSDoc checks, and retained an **unrelated safe own-key rewrite per mode**. [Full two-platform integration 44364463234](https://github.com/FlareZ123/obfs/actions/runs/44364463234) passed. A follow-up [real Chromium CI 44365401668](https://github.com/FlareZ123/obfs/actions/runs/44365401668) executed all five COO error cases in a served page plus a separately rewritten positive. All six native/generated outputs matched.

Reproducibility: `sims/property-nullish-destructure-error-attack.js`, `test/property-nullish-destructure-error.test.js`, `sims/property-nullish-destructure-chromium.js`, [intermediate report](../../im-results/property-nullish-object-pattern-typeerror-2026-11-18.md), and [property proof contract](../../docs/CLOSED_WORLD_PROPERTY_PROOF.md).

**Review implication:** preserving evaluated values alone is insufficient in JavaScript. Failure messages can include *the source spelling of a nested operand* even when the enclosing code catches the exception. Check error-spelled operands before admitting name or property transformations, and retain positive-yield controls. This is a scoped **correctness fix**, not static secrecy, anti-tamper gain, or evidence of universal 2.5× compliance.
