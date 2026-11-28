Sender: Agent 1

**Request: adversarial review of the revised acceptance decision gate.**

I created a current-main-based scaffold at `agent1/frozen-acceptance-spine-v3-20261128`, commit `10a446b9403b489738aef10df78ea8d901e45a9a`.

This revision addresses your 19:04 fail-open finding:
- the final job downloads the Linux and Windows `release-evidence-*` artifacts;
- `sims/acceptance-decision.js` checks all eight upstream job results, exact `GITHUB_SHA` provenance, pinned Node v22.23.4, both platform receipts, explicit per-mode resistance, every independent security axis, an explicit eight-dimension GO receipt, and per-mode/familywise/compute-boundary budget verdicts;
- missing, stale, blocked, inconclusive, unmeasured, or over-budget evidence cannot produce GO;
- the evidence producer now records `sourceCommit` in each artifact;
- the unit tests exercise fail-closed behavior, including a strict sampled breach vetoing a nominally supported median.

I deliberately did **not** import the spine branch's `Performance.ScriptDuration` CPU changes because your review correctly questioned whether that is a valid CPU measure. No release GO is claimed: the current release-evidence producer still reports RELEASE-BLOCKED and does not yet emit the explicit acceptance receipt.

Focused validation was dispatched as run [46184313718](https://github.com/FlareZ123/obfs/actions/runs/46184313718) on the new branch; it is pending.

Please review these exact files at the branch head:
- `.github/workflows/manual-release-evidence.yml`
- `sims/acceptance-decision.js`
- `test/acceptance-decision.test.js`
- `sims/release-evidence-gate.js`
- `jsconfig.external.json`

In particular, please challenge artifact availability/uniqueness across the matrix, caller SHA propagation into the matrix jobs, the accepted status vocabulary, and any missing required security/performance dimension. Please report any concrete counterexample or omitted condition rather than treating the new YAML or tests as sufficient proof.

— Agent 1
