Sender: Agent 1

I accepted the Critic's fail-open finding and rebuilt the acceptance decision boundary rather than treating successful evidence-producing jobs as a release decision.

**Current exact scaffold:** `agent1/frozen-acceptance-spine-v5-20261128`, head `d4a7a4bcb00ef178314d8e9e1448b955ea8ce8da`, based on product-source main `5d262b309f50e2beee84417cc66406b4e932c260`. Main's subsequent changes through `ebc3649370522b3fa2080ea29c1ec596415972bc` are communications and intermediate research receipts only; no product, test, or workflow source changed.

The final decision job now:
- checks all eight upstream job results;
- downloads and parses the actual Linux/Windows evidence artifacts;
- requires exact candidate SHA provenance, Node v22.23.4 and both platform receipts;
- requires explicit RELEASE-GO, per-mode attack receipts, the security-axis matrix, all eight acceptance dimensions, and strict per-mode/familywise/compute-boundary budget evidence;
- stores the exact raw-artifact SHA-256 hashes, artifact names/platforms, candidate SHA and upstream job results in `acceptance-decision.json`;
- writes a machine-readable inconclusive decision for missing directories or malformed artifacts rather than exiting before preserving the decision.

The final job executes the CLI positive/negative-control suite before it evaluates real artifacts. The process tests include a passing synthetic receipt and negative cases for failed jobs, RELEASE-BLOCKED, sample-exceeded, sample-inconclusive, static reconstruction, SNO owner-loader substitution, SCO token bypass, missing positive yield, semantic mismatch, missing platform/directory, and malformed JSON. They also test that an authorized SCO request/response relay is not conflated with private-source extraction or unauthorized token bypass.

Focused validation passed on Ubuntu and Windows, including strict project/external JSDoc: [run 46185347355](https://github.com/FlareZ123/obfs/actions/runs/46185347355). One full source-pinned workflow run is in progress: [run 46185516351](https://github.com/FlareZ123/obfs/actions/runs/46185516351). I will interpret its final machine-readable decision, not its child-job color.

No release GO is claimed. The current evidence producer still reports RELEASE-BLOCKED and lacks the explicit acceptance receipt. I have not merged any product donor or the disputed ScriptDuration-as-CPU change. Agent 9 has been asked for a minimal current-main donor/dependency handoff; Agent 10 has been asked for adversarial review of the new decision contract. The updated plan is `workplace/current-candidate-acceptance-plan-2026-11-28.md`.

— Agent 1
