# SCO recognized-batch outer-arity nested-authorization bypass

**23 November 2026 — Agent 41. Classification:** reproduced security-policy failure and narrowly scoped regression/fix evidence, **intermediate**. This is neither proof of SCO client secrecy nor a release admission.

## Threat model and failure

An authenticated, authorized SCO client can modify its own JSON RPC request body. The server's `authorizeRpc` accepts the caller and its outer `authorizeOperation(request, 'batch', args)` admits the batch route, but the same operation policy denies a specific registered child operation. The attacker has no trusted server source, filesystem, memory, or callbacks; only a legitimate session and observable method names.

The existing `src/sco.js` calls `getScoBatchCalls(task,args)` before inner authorization. `src/rpc-batch.js` returned an empty preflight list if the **outer args array did not have exactly one entry**. But its batch executor was an `async calls => ...` function, so supplying a second actual argument did not prevent execution of the first. For example, on a registered `batch` route with child method `child`:

```json
{"method":"batch","args":[[{"method":"child","args":["denied"]}],0]}
```

The outer policy accepts the batch method, `getScoBatchCalls` returns `[]`, the inner `authorizeOperation('child',['denied'])` is skipped, and `task(...args)` executes `child('denied')` using the first argument. By contrast the shape with no trailing `0` invokes the child preflight and correctly returns HTTP 403. The second outer argument has no useful value; its presence is sufficient.

This is a nested application authorization bypass of trusted SCO RPC actions; it is **not** a way to bypass the coarse session gate, read server source, or execute an arbitrary unregistered method. It applies to existing lower-level recognized SCO batches and is a merge-blocking dependency for the opt-in graph batching under review in draft PR #339.

## Red-first evidence

- A dedicated [helper and real HTTP regression](../test/sco-batch-extra-arity-preflight.test.js) was added before any repair. The public source commit `baba6b6d20e1bcf4b329c0e68f341ef796908aed` ran on Ubuntu and Windows in [Actions 45235704851](https://github.com/FlareZ123/obfs/actions/runs/45235704851).
- Both operating systems failed the new regressions. Ubuntu's job reports `Missing expected rejection` for direct helper invocation and `surplus-arity batch executed` because the forbidden HTTP request returned **200**, not the expected refusal. A normal-shaped denied request continued to return 403.
- The source-pinned red demonstrates the actual vulnerability; it does not depend on compiler output readability or an attacker-controlled server.

## Fix and current validation

- [PR #340](https://github.com/FlareZ123/obfs/pull/340) changes the returned executor to a one-parameter async function with its **own** `arguments.length`; it rejects any outer call except exactly one actual argument before private side effects. This does not alter valid one-argument batch behavior.
- At patched source `748901a6c010853e1337fe5277023352a906cdb6`, [Actions 45235911403](https://github.com/FlareZ123/obfs/actions/runs/45235911403) passed both new direct-helper/real-HTTP tests on **Ubuntu and Windows**; Windows also passed the full existing manual SCO authorization workflow, including its strict JSDoc checks.
- Ubuntu's overall workflow remained **RED**, including one retry of the same pinned SHA, in the later pre-existing IPv6 Chromium test: its **native baseline** HTML stayed `pending` instead of `[::1]|42` before exercising the SCO transformed script. This test neither imports nor invokes `createScoBatchMethod`. Do not present this as a dual-platform full-gate green receipt or silently remove the failing test.
- The existing manual workflow has a new upfront step for this security regression; no per-commit CI workflow was added.

## Remaining obligations

Integrate the reviewable core repair before shipping any graph-composed batch from PR #339; re-check the combined exact source and run its appropriate focused security/parity/CPU gates. The added arity check is O(1) but a universal 2.5× application compute bound has **not** been established. Other authorization mistakes in application-supplied policy, same-account online relaying, and full-control client extraction remain out of scope. The repository remains **RELEASE-BLOCKED** under the three-mode primary objective.
