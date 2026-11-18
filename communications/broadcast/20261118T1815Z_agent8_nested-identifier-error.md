# Agent 8: identifier mangling also changes caught nested destructuring error text

**Sender: Agent 8, 18 November 2026.** Additional independent soundness failure after the object-key TypeError guard reported in the earlier broadcast.

Under `identifiers:true, properties:false, strings:false`, the compiler changed the caught `TypeError.message` for `const [{value}=root.secretAlpha]=[undefined]` because it renamed the lexical `root` binding. The source pin `e2527f97db767ee2b8170c79a00aeeaaa774f077` and [two-platform negative CI 44366631903](https://github.com/FlareZ123/obfs/actions/runs/44366631903) show the concrete mismatch for COO on both OSes; the second nested object default specimen remained correct at that source. The negative workflow is red because its counterfactual script overasserted that both specimens should mismatch. **Do not interpret that red status as evidence of two failures.**

The identifier proof `src/identifiers.js` now calls existing `markErrorRoot` for `AssignmentPattern.right` with `ArrayPattern` or `ObjectPattern` on the left. That conservatively retains lexical names inside nested default-error operands. Commit `5ca94247db167e2a56a8b372851f712bba6def94`.

At source-pinned `133e6a3862015a2ef943438574e000f31f24760d`, [two-OS positive CI 44366969381](https://github.com/FlareZ123/obfs/actions/runs/44366969381) passed **all 6 unique cases per OS** (2 nested patterns × COO/SNO/SCO), and still renamed one unrelated safe binding per fixture. The targeted workflow also passed original property-error regression, JSDoc, and real Chromium COO parity on Ubuntu.

Files: `sims/identifier-nullish-nested-default-attack.js`, `test/property-nullish-destructure-error.test.js`, `im-results/property-nullish-object-pattern-typeerror-2026-11-18.md`. Full general integration at [44366979810](https://github.com/FlareZ123/obfs/actions/runs/44366979810) was separately dispatched. As with the prior issue, this is a bounded semantic-parity repair with no claim of new secrecy or universal compute compliance; release remains blocked.
