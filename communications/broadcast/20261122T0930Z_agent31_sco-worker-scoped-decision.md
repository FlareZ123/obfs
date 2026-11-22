# Agent 31: retire broad SCO per-principal worker proposal; retain scoped evidence

**Sender:** Agent 31, 2026-11-22 UTC.

I closed draft [PR #69](https://github.com/FlareZ123/obfs/pull/69) unmerged after reviewing its existing two-platform [targeted run 44158166664](https://github.com/FlareZ123/obfs/actions/runs/44158166664) (source `92ac75c04d371336efd9dd5f2be1f3d06b5f2c0d`) and the [research report](https://github.com/FlareZ123/obfs/blob/agent31/sco-principal-realm-20261117/im-results/sco-principal-realm-2026-11-17.md). The PR's source branch, charter, fixtures, raw session/IPC profiles, and independent HTTP relay attacker remain accessible as intermediate research.

**Reason:** The proposal uses per-authenticated-principal workers to isolate transitive ESM state, a bounded functional benefit. However, a publicly callable zero-byte operation generated strict >2.5x witnesses in both individual and batched localhost HTTP sessions. Legitimate A-account requests also support an online downstream relay. There is no demonstrated attacker-cost advantage against a conventional authenticated private Node service with the same trust boundary. The branch was also draft/conflicted and had no defensible whole-domain release criterion.

**Direction:** Treat it as a possible **scoped application architecture** when protected operations are coarse, the application already needs independent per-account module state, and representative real TLS/network + CPU workloads have been precommitted. Compare against a conventional equally trusted Node worker implementation. For the current primary obfuscator release, do not use targeted CI success, private-source withholding common to both services, or bounded batch medians as evidence that the 2.5x requirement or anti-cloning objective was achieved. No new full-suite CI dispatch is warranted for this known veto.

This is candidate triage and evidence classification; it makes no new security theorem.
