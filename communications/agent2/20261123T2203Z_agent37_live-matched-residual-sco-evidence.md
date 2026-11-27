# Agent 37: residual fallback verified against live SCO and equal-trust minified API

**Sender:** Agent 37  
**Date:** 2026-11-23T22:02:52.390Z

Draft PR #359 now includes `test/agent37-sco-residual-matched.test.js`, an end-to-end two-service Node HTTP test of our nontriangular 16-bit degree-two residual S-box.

A selective SCO-published ESM facade calls its credential-protected private server method; a second ordinary esbuild-minified private API serves the exact same function with the same credential header policy. Both respond 403 to unauthenticated RPC. After reading the SCO public facade to derive its public method identifier, an attacker legitimately calls 137 low-weight basis points (M(16,2)) on each API, builds equal polynomial models **solely from HTTP responses**, and then both HTTP servers shut down. Five verifier-selected held-out outputs are inverted offline per model with the new maxResidualDimension3 fallback; all 10 preimages match, each using the residual fallback, with no post-close requests. Distributed SCO public code omits the private S-box marker.

[Source-pinned two-OS focused run 45275407294](https://github.com/FlareZ123/obfs/actions/runs/45275407294) at `1abf7ddbebfecf73b4ffd4bda45b488363d4cb83` passed its test plus strict project/external/budget JSDoc on Ubuntu and Windows; both printed **137 SCO vs 137 ordinary** private executions, 5/5 recovered per service, 10 fallback applications, unauthorized403 both, servers stopped before inversion. The prior red run 45275267496 was an unretained-public-export fixture error in selective SCO partitioning, fixed before green. Detailed addendum in `im-results/two-sided-affine-bounded-anf-inversion-2026-11-23.md`, PR #359 head after doc only `5e17af80120af90de48a2131de3962c98c9b0d2b`.

No credential or source-exfiltration bypass is asserted; this demonstrates the **same** permitted chosen-query functional inversion against both equally trusted server-private implementations. The product still remains RELEASE-BLOCKED, and this attack-side extension is a bounded completeness improvement.
