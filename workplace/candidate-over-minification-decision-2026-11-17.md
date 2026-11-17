# Experimental selection: current COO polyvariant arithmetic versus conventional minification

**Date:** 2026-11-17. **Classification:** Source-pinned, application-scoped candidate decision. This is a negative experimental choice, not a security theorem or repository-wide release gate.

## Candidate and control

The existing frozen three-module stateful ESM application is the common input. Its public API, Unicode records, state transitions, and host callback trace are invariant. See [the four-way experimental design](../im-results/four-way-minified-control-design-2026-11-17.md) and [the source/entry coverage audit](../sims/polyvariant-app-execution-coverage.js).

- Conventional control: esbuild 0.28.2, `minify:true`, per-module ESM output without bundling or property mangling.
- Candidate: compiler-generated COO two-path affine/polyvariant lowering on the three exported `round*` arithmetic functions in `math.mjs`; `state.mjs` and `entry.mjs` retain native source.
- Independent reconstruction: source-only AST recovery of each output family, plus a **matched** public-only numeric oracle attacking the native, minified, COO-published, and reconstructed modules with exactly one `f(0)` observation per selected function. The restricted hypothesis is a signed Int32 input translation. A separate negative test shows this model fails for nonlinear arithmetic.

The frozen native graph contains 2,467 bytes. The protected arithmetic source occupies 309 bytes, or 12.52533% of the original delivered source by bytes. The full obfuscated graph is 7,518 bytes, compared with 1,115 bytes for the minified control. This is transformed-source coverage and packaging cost, not protected runtime-compute coverage.

## Measured evidence

The original nine-trial version passed [run 44033291091](https://github.com/FlareZ123/obfs/actions/runs/44033291091) at `c9e27ed` on Node22 Ubuntu/Windows with Ubuntu Chromium. The new balanced twelve-trial, matched-query experiment is [run 44047990141](https://github.com/FlareZ123/obfs/actions/runs/44047990141), executable source commit `69464f296a8e426c1be175960e7130f7e3203646`. Its **Windows job has passed** and Ubuntu remains pending at the time of this draft. Twelve trials position each of four variants exactly three times in each run-order rank. Browser-fresh graph confirmation uses 288 distinct module requests at two selected workloads.

For the exact Windows twelve-trial job, the selected public exports yield offsets `round1=324`, `round2=292`, `round3=324` under three fitting queries in **every** distribution. After committing to the model, all 12,288 held-out signed-Int32 comparisons per distribution match native. Those verifier-only observations must remain separate from the three fitting queries. A published module reload and attacker-model formation time are not controlled by a wall-clock matched human adversary.

| Windows full-ESM workload | COO/native ratio of medians | One-sided upper median paired-ratio bound |
| ---: | ---: | ---: |
| 1 event | 1.2592× | 1.7227× |
| 50 events | 1.3850× | 1.9366× |
| 1,000 events | 1.5157× | 1.6102× |
| 10,000 events | 1.2524× | 1.3954× |

The four-workload simultaneous Bonferroni sampled diagnostic reports a 97.4609375% lower joint-coverage claim under the stated independent-identically-distributed within-workload model. The maximum observed paired slowdown is 2.02635×, with zero observed samples above 2.5×. Module preparation, build, static attacker time, Node process creation and external deployment network costs are outside this runtime boundary. These are the observed fixed runner workloads; no worst-case guarantee follows.

## Independent axes and bounded decision

| Axis | Decision for this selected application |
| --- | --- |
| Functional behavior | **Supported** under previous two-platform and Chrome nine-trial parity and new Windows twelve-trial parity. Linux twelve-trial pending |
| Static reconstruction | **Reconstructed**: specialized source-only attacks recover all three selected leaves from each emitted source family. These are selected-function proofs |
| Matched dynamic query attacker | **Contradicted security advantage**: the same three-query Int32 translation model clones all selected leaves for minified and COO outputs on Windows |
| Modification/integrity and environment lock | **Unmeasured by this comparison**. Repository-wide SCO/SNO/COO hostility gates remain separate; a static-minifier comparison cannot infer these axes |
| CPU performance | **Sample-supported on Windows** for four selected loads, under the confidence and boundary caveats. The 2.5× hard requirement is a separate per-run or workload claim |
| Distributed size | **Disadvantage**: 7,518 published bytes versus 1,115 minified bytes |

**Decision: reject the current selective COO affine/polyvariant configuration as an established stronger protection choice than ordinary esbuild minification for this frozen application and restricted attack family.** Both are recoverable by the matched numeric attacker, while the COO candidate expands the distribution. Rejection here does not say that every obfuscator or all possible workloads fail. Conventional minification is a defensible delivery default for this non-secret public functionality; private secrets or authorization must be enforced by a trusted component under a separate SCO threat and latency model.

A replacement candidate should be compared on the same original program with comparable attack budgets, explicit proportion of protected and exercised logic, full host-observable parity, measured browser and server boundaries, and independent static/dynamic attacker models. Maintain `inconclusive` when no matched attacker, insufficient held-out validation, or insufficient runtime data exist. Do not convert a failed restricted attack into general anti-reconstruction success.

## Pending falsifiers

Before treating the new four-way run as cross-platform validated, require the queued Ubuntu Node and Chromium jobs to pass at the exact executable source SHA. An Ubuntu measured slowdown or parity error would refine the per-platform decision. A new candidate that resists the same bounded attacker while retaining parity and meeting both sample and strict observed runtime controls would warrant a separate **supported** experimental choice on that scope. Absolute hostility-model secrecy for COO/SNO is outside these observations.
