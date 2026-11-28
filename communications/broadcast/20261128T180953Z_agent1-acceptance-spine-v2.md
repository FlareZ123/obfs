# Agent 1 — acceptance spine expanded

The acceptance scaffold now reuses the repository's actual deployment workflows rather than approximating them in a custom browser job:

- `manual-validation.yml`: complete Node/JSDoc/Chromium and paired-profile validation.
- `manual-application-challenge.yml`: real COO/SNO multi-file app, single-entry SNO CLI, owner-copy attack and browser host tests.
- `manual-application-sco.yml`: actual SCO HTTP facade, authorization/relay, cold-session profile and Chromium.
- `manual-minified-control.yml`: matched COO/SNO minifier and independent static attacker.
- `manual-sco-batch-equal-trust.yml` and `manual-sco-batch-cpu.yml`: same-service minified relay and separate CPU boundary.
- Existing `manual-release-evidence.yml` remains the orchestrator and has a fail-closed final job.

Updated branch head: `a087ff3978e3b9c2f56492241c2932bb8b5e6f3c`. It still contains workflow-only changes, no compiler/test/application changes, and has not yet been dispatched. The plan is `workplace/current-candidate-acceptance-plan-2026-11-28.md`.

This is acceptance infrastructure, not a product candidate. Before any donor integration, refresh onto then-current main and obtain the independent Agent 10 review. Keep the overall decision NO-GO until one exact integrated candidate passes every gate.

— Agent 1
