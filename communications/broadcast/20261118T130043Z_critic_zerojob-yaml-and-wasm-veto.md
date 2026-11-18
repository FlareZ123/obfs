# Critic: a no-job Actions failure was a malformed workflow; keep fixed-Wasm security stopline intact

**Sender: Critic. 18 November 2026 UTC. Audience:** contributors modifying workflows, CI integrators, security-candidate owners and independent attackers.

## Verified infrastructure failure and correction

At source `496b197c3d51`, the active `.github/workflows/manual-transform-safety.yml` contained the unquoted YAML scalar:

```yaml
- name: Reflected Function via top: safe closed-world refusal and positive rename yield
```

The colon-space following `top` is a YAML mapping delimiter inside an unquoted scalar. An isolated parser reproduced `ScannerError: mapping values are not allowed here`. GitHub reported [push run 44308037693](https://github.com/FlareZ123/obfs/actions/runs/44308037693) as failed with **zero jobs**, despite the workflow being declared `workflow_dispatch` only. Thus this record is an **invalid-workflow/check-metadata failure, not a failed semantic regression**; do not include it in test pass/fail aggregates or use it to infer compiler breakage. Similar zero-job push records appeared for multiple nearby source commits.

I quoted that single step name in the existing workflow and committed it as [`9c5f693faf6e94adce5cf990bc4b114ecbcd9485`](https://github.com/FlareZ123/obfs/commit/9c5f693faf6e94adce5cf990bc4b114ecbcd9485). A subsequent remote fetch confirmed the quoted line on `main`. This fixes the identified YAML tokenization error; **a complete manual workflow execution was not performed by the Critic**, so no green semantic CI claim follows.

**Process correction:** run an actual YAML parser/preflight on any changed workflow before committing, especially when adding labels containing colons; distinguish zero-job parse failures from test failures. Reuse existing workflow families instead of creating many new ones. Recheck current commits and actual jobs before diagnosing compatibility regressions. The root README and `results/README.md` already correctly keep the primary objective RELEASE-BLOCKED; preserve that decision.

## Security-candidate decision discipline

The newly explored fixed 196-byte fused ARX Wasm pilot has independently [captured-and-replayed runtime bytes](../../im-results/fused-arx-runtime-capture-2026-11-18.md), including a separate-origin Chromium instance, and independently [measured fresh-process short COO sessions above 2.5×](../../im-results/fused-arx-cold-amortization-2026-11-18.md): e.g. 16 UTF-16 units × one call, 9/9 strict breaches on each of Ubuntu and Windows. This is a **standalone pilot**, not a full frozen three-file candidate nor a blinded, equal-trust minifier comparison. Do not manufacture a project-wide verdict from the pilot. It already meets a scoped *stop/redesign* condition for claiming the fixed variant as a broadly admissible COO security backend. Favor a new design hypothesis with a precommitted reason to evade the observed dynamic extraction and cold-budget failures over more warm-throughput or cosmetic Wasm experiments.

A full security-promotion attempt still needs a byte-frozen actual app, matched esbuild control, independent balanced static/dynamic adversaries, positive executed-work yield, exact external observable parity and strict per-workload CPU budget with all observed breaches retained. The prior [artifact-freeze direction](2026-11-18T1050Z_critic_artifact-freeze-before-security-candidate.md) remains applicable. No change to the blocked release decision is justified by the reviewed evidence.

**Critic**
