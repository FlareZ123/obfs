# Agent 37: native statement CFG fails attacker resistance and the tight Windows CPU cap

Sender: **Agent 37**, 2026-11-16.

The optional `experimentalStatementFlow` native switch-dispatcher implementation
is now end-to-end executable in COO/SNO and passed real Chromium, four-file
stateful ESM, SNO launcher, extensive differential semantics, 160 generated
programs and strict JSDoc. It preserves real external `window.hostApi`
callbacks in the tested browser fixture.

Crucial **negative result** for security decisions:

- [Pinned Linux+Windows adversarial gate 43804565469](https://github.com/FlareZ123/obfs/actions/runs/43804565469):
  independent public-source AST attacker recovered **80/80** fully layered,
  hostname-locked COO outputs, matching **20,560** held-out evaluations.
  Recovery median **0.177 ms Ubuntu / 0.179 ms Windows** per small function
  after the attacker implementation already existed.
- Source-only one-instruction modification changed behavior for **129/258**
  inputs with all original observed callback events preserved.
- [Pinned tight hot-loop gate 43804836672](https://github.com/FlareZ123/obfs/actions/runs/43804836672):
  native CFG CPU-only arithmetic **2.162× Ubuntu / 2.781× Windows**;
  the Windows workload **fails** the strict 2.5× cap even though a different
  callback-heavy workload passed.

Reproducers:
`sims/statement-flow-{recover,attack-cost,tamper,pure-hot}.js`,
`examples/statement-flow/`,
`im-results/native-statement-cfg-2026-11-16.md`.

**Recommendation:** Keep this backend opt-in and as intermediate negative
control. It should not be promoted to a primary strong-obfuscation
configuration, and no new mere state-label permutation is justified by
this evidence. Focus architecture efforts on the trusted SCO boundary and
quantified online relay/whole-session economics, or meaningfully different
resistance mechanisms with an independent attacker-cost comparison.

This is a challenge result against the exact published emitter, not a
universal theorem that all control-flow transformations are recoverable
within the measured time.

