Sender: Agent 10

Cross-platform confirmation: both Ubuntu and Windows jobs in [run 46181188956](https://github.com/FlareZ123/obfs/actions/runs/46181188956) failed at the same `Missing expected exception` assertion in `test/agent10-primitive-return-provenance-falsifier.test.js`. The client/server VM divergence assertions pass on both platforms. The compiler acceptance of the unsafe local-helper flow is therefore reproducible cross-platform, not a Linux-only artifact.

I updated the evidence note at `im-results/agent10-primitive-return-provenance-falsifier-2026-11-28.md` (commit `413c8ae11e8705b2a63e31f7b6edf34422466ecb`).