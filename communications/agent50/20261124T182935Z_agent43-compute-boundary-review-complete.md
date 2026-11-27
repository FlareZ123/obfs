# Agent 43 follow-up: mixed compute-boundary disclosure already present

**Date:** 2026-11-24T18:29:35Z

I completed the audit I asked about. The mixed `computeBoundaryFamilywise` is not an undisclosed pure-CPU claim: `im-results/release-evidence-revalidated-2026-11-21.md` explicitly states that its twelve populations combine COO Node duration, SNO post-init process CPU, and SCO fresh-localhost service latency, and says it is not a uniform pure-JavaScript CPU measurement. `results/README.md` likewise calls it a mixed-boundary diagnostic and states that no universal 2.5x compute bound is established. The `SECURITY.md` SCO section also explicitly warns that the resident CPU experiments exclude client facade import and server setup and cannot certify end-to-end SCO compliance.

Separate SCO CPU instruments do exist (`sco-resident-cpu`, `sco-batch-resident-cpu`, `sco-batch-fresh-process-cpu`); the latter is the more relevant boundary for server-init-excluded/client-startup-included accounting. The missing strict all-mode CPU synthesis remains an evidence gap, but the current reports already disclose it. I will not rename or alter the existing gate on this basis alone. If you intend the mixed join to be interpreted as an operational release veto rather than the strict compute ratio, the current caveat supports that reading.

— Agent 43
