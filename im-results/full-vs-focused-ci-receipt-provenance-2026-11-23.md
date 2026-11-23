# Source-pinned GitHub Actions receipt classification for obfuscator integration

**Agent 26, 23 November 2026. Classification: intermediate engineering validation.**
This report preserves a reproducible distinction between a completed full
validation failure and a completed successful *focused* test. It does not
establish a new obfuscation technique, a security theorem, or release readiness.

## Actual immutable source records

Two run records and their complete named step-conclusion inventory were read
from the GitHub Actions run and job endpoints, not inferred from workflow status:

| GitHub Actions run | Source SHA | Actual executed matrix | Conclusion |
| --- | --- | --- | --- |
| [45136105520](https://github.com/FlareZ123/obfs/actions/runs/45136105520) | '72e1c170b28b165c150a12df1d12ee21cf4b891c' | 'node22 (ubuntu-latest)' and 'node22 (windows-latest)' | RED on both platforms: behavioral/adversarial suite failed |
| [45141870967](https://github.com/FlareZ123/obfs/actions/runs/45141870967) | 'd1efacb1578b5443456a18b87839c2f3a024b24a' | 'focused (ubuntu-latest)' and 'focused (windows-latest)' | GREEN focused only; the full 'node22' matrix was skipped |

In the full RED run, both platforms successfully executed strict project,
external, specialized JSDoc checks and the sample performance steps after the
failed behavioral step. Ubuntu passed its real Chromium checks. These step
successes did not undo the behavioral failure. The failed test inventory in
[the mainline report](mainline-full-validation-2026-11-23-0721.md) is a
separately frozen source and must not be assumed to describe every later SHA.

The green focused run executed the requested one-test path and strict
typechecks on both OSes. Its overall 'success' value says nothing about the
full behavioral suite, Chromium integration and selected performance checks,
because those steps were not executed in that run.

## Auditable implementation

Research branch:
[agent26/full-gate-receipt-classifier-20261123](https://github.com/FlareZ123/obfs/tree/agent26/full-gate-receipt-classifier-20261123).

- 'sims/validation-receipt-classifier.js': pure CommonJS/JSDoc function
  'classifyValidationRun(run, jobs, expectedSha)'. It returns full-green,
  full-red, focused-green, focused-red, incomplete or sha-mismatch.
- 'test/fixtures/validation-receipts-20261123.json': condensed, actual
  Actions run and job JSON, including source SHA, workflow identity, run ID,
  retry attempt, job completion, job names, step names and conclusions.
- 'test/validation-receipt-classifier.test.js': 16 deterministic cases
  exercising both real historical snapshots and synthetic bad evidence.
- 'jsconfig.external.json': explicitly includes the new helper and test in
  strict JSDoc checking.

A successful *full* classification requires an exact caller-provided commit
SHA, the expected repository manual-validation workflow ID, path and dispatch
event, a completed successful run, both completed Node 22 operating-system
jobs from that exact run and retry attempt, all the named mandatory
behavioral/JSDoc/benchmark steps, and the relevant real-Chromium steps on
Ubuntu. It refuses missing, skipped or failed required steps. The focused
classification is separately labelled and cannot be promoted to full.

A false green can otherwise result from accidentally joining job JSON from
two concurrent workflow runs, two source SHAs or two attempts of a re-run.
The classifier rejects each mismatch. Additional negative cases refuse
missing Windows matrix evidence, skipped behavioral tests, duplicate jobs,
in-progress runs, copied step names from a different workflow, and unexpected
workflow trigger events. The compiled code has no GitHub network or
filesystem side effect and makes no attempt to edit or execute an obfuscator.

## Reproducible gate and source pin

**Latest exact source for this evidence tool:**
'aeff784f1f847cb85c67a0f52e034d02cbc2ada6'.

The existing manually dispatched '.github/workflows/manual-validation.yml'
was run with 'focused_test=test/validation-receipt-classifier.test.js'.
[Workflow 45146272822](https://github.com/FlareZ123/obfs/actions/runs/45146272822)
completed **success**: Ubuntu and Windows ran all **16/16** test cases
and passed project, external and paired-budget strict JSDoc steps. The full
Node22 matrix was intentionally skipped for this focused research tool.

Earlier exact source '5b729cc113271f59e04e73793a8e642fd38a489b'
passed 10/10 cases on both OSes [45144081365](https://github.com/FlareZ123/obfs/actions/runs/45144081365).
The intermediate expansion had external-JSDoc failures when initially loading
JSON without module-resolution types; it was corrected with an explicitly typed
Node filesystem read before the subsequent green source pin. Historical
failed CI attempts remain visible as evidence of validation rather than
being silently described as successful.

## Limits and disposition

This small helper verifies the *recorded invocation identity and step outcomes*
under the assumption that inputs are authentic GitHub API records. It cannot
verify that a workflow file's implementation was independently audited, that
the source branch remains current, that an individual test has a sound oracle,
or that a successful test exercised nonzero private transformations. It also
does not establish universal runtime ≤2.5×, offline reconstruction resistance,
dynamic extraction resistance, tamper resistance or permitted-environment
execution under the project's hostile attacker models.

The caller must fetch the actual intended workflow and its latest exact
source SHA from trusted GitHub API endpoints. It must compare that SHA against
the target source, and separately inspect the version-controlled workflow
definition; supplying invented JSON defeats any local classifier. No current
full-mainline GREEN receipt has been established by this experiment.

This is an optional review/CI-evidence utility, **not a competing source
integration branch**. No production obfuscator 'src/' or 'bin/' file was changed,
and no additional workflow was created. The intake owner, Agent 10, was
notified in
'communications/agent10/20261123T0908Z_agent26_full-focused-receipt-classifier.md'.
The canonical source proof owner remains Agent 3. The overall three-mode
strong-protection decision remains **RELEASE-BLOCKED**.
