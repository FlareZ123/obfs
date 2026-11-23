# SCO Web IDL direct-method admission candidate: source-pinned, pending integration

**Agent 8, 23 November 2026. Status: compiler candidate; NOT yet accepted.**

## Problem and source scope

The prior test-only red source `df885ca4f15bfcbf3da90f2bdf2631fb1b118517`, focused GitHub Actions run [45255283045](https://github.com/FlareZ123/obfs/actions/runs/45255283045), reproduced selected-private host-semantic divergence after the constructor-only patch (PR #351). On real Chromium 157 browser-original versus authenticated SCO facade running the private operation in Node 22.23.4:

- `new Headers().append('bad name','x')` browser: `TypeError:Failed to execute 'append' on 'Headers': Invalid name`; Node: `TypeError:Headers.append: "bad name" is an invalid header name.`
- `new URLSearchParams().append(Symbol('x'),'1')` browser: `TypeError:Failed to execute 'append' on 'URLSearchParams': Cannot convert a Symbol value to a string`; Node: `TypeError:Cannot convert a Symbol value to a string`.

A previous valid `new URLSearchParams('a=1').get('a')` continued to return `1` on both hosts. Source-level constructor validation alone did not constrain subsequent method effects.

## Proposed compiler behavior

**Candidate source HEAD:** `f32e1a6285a2e221256c7cceca2f44bb8618eb53` on `agent8/sco-webidl-method-admission-20261123`. Only `src/sco-selective-partition.js` and the new focused test are changed.

Within the existing `usesUnprovedRelocatedWebIdlConstructors` admission predicate, a directly constructed URLSearchParams or Headers instance must have an immediately consumed, directly called method with narrowly statically bounded literal arguments. For URLSearchParams, candidate read methods are `get`, `getAll`, `has`, and `toString`; candidate mutations are `append`, `set`, `delete`, `sort` with exact literal argument counts. Headers candidates are `get`, `has`, `append`, `set`, `delete`; header field names match a deliberately strict lowercase ASCII token subset. Arguments for value or query strings are printable literal ASCII. Unproved arguments, extra arguments, optional or extracted method calls, local instance aliases, instances returned directly, and constructor retrieval from spelled global-object member or destructuring aliases fail closed.

The existing same predicate executes for both selected private exports/helpers and imported static ESM graph leaves. No application runtime checks, extra RPCs, or VM instructions are introduced. This predicts **zero new runtime operations**, but no measured performance bound follows. Conservative rejection reduces the set of eligible private programs; it does not prove whole-program cross-host equivalence, especially reflective constructor retrieval, mutable realm prototypes, or indirect dynamic call targets.

## Evidence available now

- Static source inspection confirms the explicit guard and both relevant private-source call sites remain in the compiler.
- In isolated evaluation of the **actual candidate predicate text** against manually built ESTree nodes, **11/11 initial direct-method cases** matched expectation; after extending explicit-global alias rejection, **10/10 additional cases** matched expectation. These are isolated predicate checks with a minimal AST walker, **not Acorn parsing, project compiler integration, strict JSDoc, or browser HTTP tests**.
- Candidate `test/sco-webidl-method-host-browser.test.js` includes static selected-export and imported-ESM graph admission matrices; real Chromium + original/emitted/Node positive pairs for bounded `get`, `toString`, `append`, and arithmetic; malformed-argument refusal controls; and an authenticated RPC/unauthorized HTTP 403 check. It is currently unexecuted on this source SHA.
- Relevant Web documentation: [Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers) describes method exceptions for invalid names; [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) lists public method contracts. These sources guide the candidate's bounded argument classes; they are not a cross-engine parity proof.

## Explicit acceptance decision and next action

**Required focused dispatch:** `.github/workflows/manual-validation.yml` on this branch at exact `f32e1a6285a2e221256c7cceca2f44bb8618eb53`, input `focused_test=test/sco-webidl-method-host-browser.test.js`. Green must include Ubuntu real Chrome original/SCO/Node result and HTTP 403 controls, Windows static/graph checks, strict project/external/paired-budget JSDoc. A green would warrant guarded integration review and one current-source full acceptance gate; it would not establish the primary obfuscation security objective. Red requires retaining this candidate off main and triaging the actual failing case rather than describing it as fixed.

The available connected GitHub repository API in this invocation does not expose a workflow dispatch action. The test therefore remains **pending**, and no mainline merge or release claim is appropriate. The repo-wide decision remains **RELEASE-BLOCKED**.
