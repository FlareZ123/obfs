# Host UID process-isolation probe (2026-11-26)

**Status:** local proof-of-concept and GitHub-hosted Ubuntu runner validation passed (workflow run 45766047292, commit 3ab1be8227c8664d5b85e3fca92c2518c8b69821). This is an intermediate host-UID harness result, not a container-security proof or a production acceptance claim.

## Why this probe exists

The hW live matched-control harness launches the Node server as nobody, but its Python learner is launched by the GitHub runner process without a UID drop. The learner therefore runs as the same runner UID as the orchestrator, inherits its environment, and has the runner's passwordless sudo capability. The server's nobody UID and 0700 private temp root do not protect it from that learner: the learner can elevate with sudo. Separately, the learner receives --oracle-seed, derived from target seed and state_count, in its command line.

The intended boundary is three distinct roles:

- parent orchestrator/evaluator: GitHub runner UID;
- private target server: www-data (UID 33);
- untrusted learner: nobody (UID 65534), with no-new-privileges, an empty capability bounding set, and a scrubbed environment.

## Probe behavior

sims/agent49-process-isolation-probe.py starts a local HTTP server as www-data. The server creates a private temporary directory with mode 0700 and a fixture file with mode 0600. A separate learner process runs as nobody, receives only a local HTTP URL, the private-file path (to test denial), and process IDs (to test /proc access). The parent launches both children with setpriv --no-new-privs --bounding-set=-all and passes a small environment allowlist. The client must still reach the HTTP service.

The probe checks that the learner:

- has UID/EUID 65534;
- cannot open the private fixture file;
- cannot read the server's /proc environment, memory, or file-descriptor entry;
- cannot read the parent orchestrator's /proc environment;
- cannot elevate with sudo -n true;
- receives no GITHUB_, RUNNER_, ACTIONS_, TARGET_, FIXTURE_, or ORACLE_ environment variables;
- can still make an HTTP request to the server.

The server's /proc/<pid>/cmdline is commonly visible across UIDs. The probe therefore checks that the command line contains no private path or secret rather than assuming cmdline is inaccessible. This is an important constraint: never place target secrets, fixture parameters, or private paths in process arguments.

## Local result

The local root-container run passed every assertion:

| Property | Observed |
|---|---:|
| Parent UID | 0 (local container) |
| Server UID | 33 (www-data) |
| Learner UID/EUID | 65534 (nobody) |
| Private directory/file modes | 0700 / 0600 |
| Private file read | denied |
| Server /proc environment/memory/fd access | denied |
| Parent /proc environment access | denied |
| sudo -n true in learner | blocked |
| Runner/target environment leakage | none in learner allowlist |
| Public HTTP request | succeeded |

The local run validates the mechanics in this container, not the GitHub-hosted runner. .github/workflows/manual-agent49-process-isolation-probe.yml provides a manual-only hosted-runner reproduction and uploads the JSON evidence artifact.

## Integration recommendation for the hW harness

1. Launch both SCO and ordinary server processes as www-data (not nobody). Keep their private temp roots owned by that user and mode 0700.
2. Copy only the public learner script into the world-readable mirror directory, then launch it as nobody using setpriv --no-new-privs --bounding-set=-all. Do not execute learner code as the runner UID.
3. Pass a minimal environment allowlist to the learner subprocess. Do not inherit GitHub runner variables or the parent environment.
4. Replace the target-derived oracle_seed = f(seed, state_count) with a fixed or separately configured learner RNG seed independent of target identity. The learner may know its own RNG seed; it must not encode the target fixture seed or state count.
5. Keep target seed, state count, transition table, canary, and evaluator in the parent/server only. Do not put private data in argv, environment variables, world-readable files, or learner-visible artifacts.
6. Keep the client/server on distinct UIDs; test that the learner cannot read the private file or inspect server/parent memory, and can still reach the intended HTTP endpoint.

This host-UID design is materially stronger than a same-runner-UID learner with passwordless sudo. A separate Docker/container boundary with no shared volumes, no Docker socket, a dedicated internal network, read-only filesystems, and dropped capabilities would be stronger still. The current probe does not test network egress restrictions, kernel exploits, arbitrary ptrace edge cases, browser execution, or the 2.5x runtime budget.


## Hosted-runner attempt 1: launcher correction

Workflow run 45765593586 reached the Ubuntu runner and confirmed the expected accounts (runner UID 1001, www-data UID 33, nobody UID 65534), but failed before starting the server: the launcher first used sudo to drop to www-data and then invoked setpriv with --bounding-set=-all. An unprivileged www-data process cannot change its capability bounding set, so setpriv returned EPERM. This was a launcher-order defect, not a failed isolation assertion. The launcher is corrected to invoke setpriv under sudo/root and let setpriv atomically set the UID/GID, clear groups, drop the capability bounding set, and set no-new-privileges before exec. The local root-container probe passes after this correction; hosted-runner rerun is pending.


## Hosted-runner attempt 2: environment and cleanup correction

Workflow run 45765743527 successfully started the server as UID 33 and the learner as UID/EUID 65534. The private-file, server /proc environment/memory/fd, parent /proc environment, sudo-block, HTTP-reachability, and command-line checks all passed. The run failed because sudo reconstructed runner variables after the initial subprocess env allowlist; the learner saw RUNNER_TOOL_CACHE and other hosted-image variables. Cleanup also attempted to signal the server directly from the unprivileged runner UID and received EPERM. The launcher is now changed to execute setpriv under sudo/root, drop UID/GID/capabilities and set no-new-privileges, then execute env -i with the explicit allowlist after the privilege transition. Parent cleanup now uses sudo to signal the server when required. A third hosted-runner dispatch is pending.


## Hosted-runner result

The manual workflow passed on ubuntu-latest in run [45766047292](https://github.com/FlareZ123/obfs/actions/runs/45766047292). Observed parent UID 1001 (runner), server UID 33 (www-data), and learner UID/EUID 65534 (nobody). The server private directory/file were 0700/0600. All checks passed: private-file denial; server /proc environment, memory, and fd denial; parent /proc environment denial; no private data in the server command line; no-new-privileges prevented sudo; the learner received only the explicit environment allowlist (HOME, LANG, LD_LIBRARY_PATH, PATH, PYTHONHASHSEED, PYTHONNOUSERSITE, TMPDIR); and the learner still reached the local HTTP endpoint. The workflow uploaded artifact 15092390228.

The first hosted attempt failed because setpriv was invoked after sudo had already dropped to the target UID, preventing capability-set changes. The second attempt correctly dropped privileges but exposed that sudo reconstructed runner environment variables; it also exposed a cleanup signal-permission issue. The final implementation runs setpriv under sudo/root, performs UID/GID/group/capability/no-new-privileges changes, then execs env -i with the allowlist; parent cleanup signals the server with sudo when needed. The final hosted run verifies the corrected sequence end-to-end.
