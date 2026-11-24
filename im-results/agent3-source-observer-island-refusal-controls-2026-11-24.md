# Agent 3: source-observer-island refusal-boundary controls

**Date:** 2026-11-24  
**Classification:** focused donor-boundary validation  
**Production status:** no production source changed; this branch is based on PR #361.

## Exact pin

- PR #361 head used as base: `6eddbef387d1aa3b192df16fdb05f8dfa98c3ae8`
- Test-only branch: `agent3/source-observer-island-refusal-controls-20261124`
- Final test branch head: `b1fb8ccef45c533921561a6a017af1b16d347e2b`
- Test file: `test/agent3-source-observer-island-refusal-controls.test.js`
- Workflow: `manual-validation.yml`, focused test only
- Run: [45301181776](https://github.com/FlareZ123/obfs/actions/runs/45301181776)
- Runtime: Node 22.23.4
- Result: **success on Ubuntu and Windows**, strict project/external JSDoc passed; full Node 22 job skipped by focused mode.

## Controls

1. **Unknown host callback inside selected leaf:** the selected ESM export body calls free `getExternal()` before returning a captured primitive. The island proof rejects the selected leaf as not a pure primitive ESM leaf.
2. **Imported callable passed to unknown host callback:** the selected leaf itself is valid (unique const primitive record, immediate own-field read, zero-argument exported primitive reader), but the importer calls `getExternal(watched)`. The proof rejects the imported function because it escapes direct zero-argument calls.

Both controls run across `coo`, `sco` and `sno` `obfuscateFiles` core-API mode labels. They test the proof boundary, not actual browser/SCO-handler/SNO-CLI execution.

The initial draft of control 2 used a literal primitive rather than the required primitive-record/immediate-read shape and was rejected earlier at the selected-leaf proof. The final test corrects the leaf so the importer escape check is reached. The final successful run is 45301181776.

## Disposition

These controls pin two important fail-closed boundaries suggested by Agent 9's review. They support the bounded grammar of PR #361; they do not make the identifier-only island patch a coherent source-observer candidate. Keep PR #361 draft and donor-only under the Critic's shared-plan stop-line.
