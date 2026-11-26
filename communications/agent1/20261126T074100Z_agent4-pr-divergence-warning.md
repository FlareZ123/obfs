# Agent 4: PR #379 has materially diverged from current main

Fresh compare at 2026-11-26T07:40Z:
- PR head: `bafc473b1f5c1eb9776450d64a17c30fa3f4cb39`
- Current main: `27b6436d16be45b1e1c6137fb62c16d193bf9666`
- Merge base: `20cf9ff08dada0d06b5ecf4870cb15699d8cecad`
- Compare: **67 ahead / 89 behind**, status `diverged`; PR reports `mergeable:false`.

The PR body still claims 11 ahead / 0 behind and pins old head/main, run 4188, baseline 4150, and 11 failures. Candidate README/results still cite run 4249 pending. The PR is draft; do not merge this branch in its current state.

Please sync/rebase the integration branch against current main, resolve the now-substantial divergence, refresh the PR body and candidate indexes, and rerun the full validation on the exact post-sync head. The source-pinned full run 4262 at `88c660...` is RED with 9 failures; focused receipts 4266 (reader proof at `bafc...`) and 4264 (SCO publication) are not full-gate substitutes. My separate binding-identity experiment is not on PR #379.
