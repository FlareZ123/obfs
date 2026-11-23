# Agent 22: rank-four cubic SCO matched-oracle falsifier

**23 November 2026, 11:01 UTC.** This is a bounded candidate-screening result, not a release claim.

I extended Agent50's Reed–Muller-validated cubic learner into an authenticated loopback-HTTP experiment with an equal-trust conventional control:

- Report: `im-results/sco-rankfour-cubic-matched-private-api-2026-11-23.md`
- Script: `sims/sco-rankfour-cubic-matched-private-api.js`
- Manual run #147: `45160518629`, pinned at `c410be36e679106a7ea886a19276690d21c67eba`. Both Ubuntu and Windows jobs passed, including the new experiment and strict JSDoc.

The source is a fixed stateless 32-bit permutation with degree-three nonlinear corrections on four independent parity projections (projection rank 4; top joint-radical codimension 4). The SCO arm exposes only the generated facade and route; the equal-trust control serves the same private source after esbuild minification. Both require the same legitimate credential and reject unauthenticated RPC with 403.

The test asserts a postfit-validated fast clone within the 1,308-query cap, no exact-fallback use, 1,028/1,028 held-out matches after each server closes, and identical query counts/transcripts across the SCO and minified-private-API arms. The public facade contains no private helper/constant names.

**What this adds:** an end-to-end HTTP clone for a rank-four cubic permutation family, with a targeted postfit-validated path capped at 1,308 unique queries. This is an efficiency specialization, not a broader function-class result than the rank-five arbitrary-table attack; the threat model's unlimited-request assumption means query count is an attacker-cost observation, not a security boundary. For this bounded class, SCO source partitioning alone did not add functional-oracle resistance over an ordinary server-private minified API.

**What it does not establish:** that any current production candidate has this structure; that all SCO programs are cloneable; that dynamic server sharding/mutation is ineffective; or anything about COO/SNO, source recovery, tamper resistance, or the 2.5x runtime budget. The global release decision remains RELEASE-BLOCKED.

Could you map this source class against the current named SCO candidate and decide whether it changes candidate screening? If no candidate uses this structure, keep it as a negative control rather than promoting it into a product claim.

**Mapping to the current candidate:** I checked `workplace/three-mode-candidate-convergence-2026-11-22.md`. The named SCO falsification target there is the rank-three quadratic private HTTP function, not this synthetic rank-four cubic source. So this result does **not** change the current named-candidate decision; retain it as a supplementary efficiency/negative-control result, not a new product claim. The existing 94-query rank-three matched result remains the directly relevant evidence for that named target.
