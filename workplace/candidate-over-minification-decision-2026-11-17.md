# Experimental selection: current COO polyvariant arithmetic versus conventional minification

**Date:** 2026-11-17. **Classification:** Source-pinned, application-scoped candidate decision. This is a negative experimental choice, not a security theorem or repository-wide release gate.

## Candidate and control

The existing frozen three-module stateful ESM application is the common input. Its public API, Unicode records, state transitions, and host callback trace are invariant. See [the four-way experimental design](../im-results/four-way-minified-control-design-2026-11-17.md) and [the source/entry coverage audit](../sims/polyvariant-app-execution-coverage.js).

- Conventional control: esbuild 0.28.2, `minify:true`, per-module ESM output without bundling or property mangling.
- Candidate: compiler-generated COO two-path affine/polyvariant lowering on the three exported `round*` arithmetic functions in `math.mjs`; `state.mjs` and `entry.mjs` retain native source.
- Independent reconstruction: source-only AST recovery of each output family, plus a **matched** public-only numeric oracle attacking the native, minified, COO-published, and reconstructed modules with exactly one `f(0)` observation per selected function. The restricted hypothesis is a signed Int32 input translation. A separate negative test shows this model fails for nonlinear arithmetic.

The frozen native graph contains 2,467 bytes. The protected arithmetic source occupies 309 bytes, or 12.52533% of the original delivered source by bytes. The full obfuscated graph is 7,518 bytes, compared with 1,115 bytes for the minified control. This is transformed-source coverage and packaging cost, not protected runtime-compute coverage.

## Measured evidence

The original nine-trial version passed [run 44033291091](https://github.com/FlareZ123/obfs/actions/runs/44033291091) at `c9e27ed` on Node22 Ubuntu/Windows with Ubuntu Chromium. The new balanced twelve-trial, matched-query experiment is [run 44047990141](https://github.com/FlareZ123/obfs/actions/runs/44047990141), executable source commit `69464f296a8e426c1be175960e7130f7e3203646`. Its **Both Windows and Ubuntu jobs passed**, including actual Chromium on Ubuntu. Windows job `133918367938`; Ubuntu job `133918368141`. This source pin used the complete original application as a common reference. Twelve trials position each of four variants exactly three times in each run-order rank. Browser-fresh graph confirmation uses 288 distinct module requests at two selected workloads.

For the exact Windows and Ubuntu twelve-trial jobs, the selected public exports yield offsets `round1=324`, `round2=292`, `round3=324` under three fitting queries in **every** distribution. After committing to the model, all 12,288 held-out signed-Int32 comparisons per distribution match native. Those verifier-only observations must remain separate from the three fitting queries. A published module reload and attacker-model formation time are not controlled by a wall-clock matched human adversary.

| Workload events | Windows COO/native median ratio | Windows upper paired median bound | Ubuntu COO/native median ratio | Ubuntu upper paired median bound |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 1.2592× | 1.7227× | 1.3688× | 1.4450× |
| 50 | 1.3850× | 1.9366× | 1.4696× | 1.5487× |
| 1,000 | 1.5157× | 1.6102× | 1.9688× | 2.2485× |
| 10,000 | 1.2524× | 1.3954× | 1.3138× | 1.4442× |

The four-workload simultaneous Bonferroni sampled diagnostic reports a 97.4609375% lower joint-coverage claim on **each** operating system under the stated independent-identically-distributed within-workload model. Maximum observed paired slowdowns were 2.02635× Windows and 2.29839× Ubuntu, with zero observed samples above 2.5× on either platform. Module preparation, build, static attacker time, Node process creation and external deployment network costs are outside this runtime boundary. These are the observed fixed runner workloads; no worst-case guarantee follows.

## Independent axes and bounded decision

| Axis | Decision for this selected application |
| --- | --- |
| Functional behavior | **Supported** under both prior nine-trial and current twelve-trial Node Windows/Ubuntu and Ubuntu Chromium output and callback checks |
| Static reconstruction | **Reconstructed**: specialized source-only attacks recover all three selected leaves from each emitted source family. These are selected-function proofs |
| Matched dynamic query attacker | **Contradicted security advantage**: the same three-query Int32 translation model clones all selected leaves for minified and COO outputs on both Windows and Ubuntu |
| Modification/integrity and environment lock | **Unmeasured by this comparison**. Repository-wide SCO/SNO/COO hostility gates remain separate; a static-minifier comparison cannot infer these axes |
| CPU performance | **Sample-supported on Windows and Ubuntu** for four selected Node loads and Ubuntu Chromium warm/fresh ESM tests under boundary caveats. A universal 2.5× hard requirement remains unproved |
| Distributed size | **Disadvantage**: 7,518 published bytes versus 1,115 minified bytes |

**Decision: reject the current selective COO affine/polyvariant configuration as an established stronger protection choice than ordinary esbuild minification for this frozen application and restricted attack family.** Both are recoverable by the matched numeric attacker, while the COO candidate expands the distribution. Rejection here does not say that every obfuscator or all possible workloads fail. Conventional minification is a defensible delivery default for this non-secret public functionality; private secrets or authorization must be enforced by a trusted component under a separate SCO threat and latency model.

A replacement candidate should be compared on the same original program with comparable attack budgets, explicit proportion of protected and exercised logic, full host-observable parity, measured browser and server boundaries, and independent static/dynamic attacker models. Maintain `inconclusive` when no matched attacker, insufficient held-out validation, or insufficient runtime data exist. Do not convert a failed restricted attack into general anti-reconstruction success.

## Pending falsifiers

The new four-way run has passed both operating systems at the pinned executable SHA, with 288 fresh Chromium ESM HTTP module fetches and Ubuntu warmed 10,000-event published/native ratio of medians 2.15493× (one-sided upper paired median bound 2.33333×). The subsequent branch integration against newer main `2b372bf3b06d9f196ce87b1b130632af749a7b48` has a separate exact-source CI run pending. A new candidate that resists the same bounded attacker while retaining parity and meeting both sample and strict observed runtime controls would warrant a separate **supported** experimental choice on that scope. Absolute hostility-model secrecy for COO/SNO is outside these observations.
