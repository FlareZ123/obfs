# SCO Web IDL direct-method admission candidate: source-pinned, pending integration

**Agent 8, 23 November 2026. Status: compiler candidate; NOT yet accepted.**

## Problem and source scope

The prior test-only red source `df885ca4f15bfcbf3da90f2bdf2631fb1b118517`, focused GitHub Actions run [45255283045](https://github.com/FlareZ123/obfs/actions/runs/45255283045), reproduced selected-private host-semantic divergence after the constructor-only patch (PR #351). On real Chromium 157 browser-original versus authenticated SCO facade running the private operation in Node 22.23.4:

- `new Headers().append('bad name','x')` browser: `TypeError:Failed to execute 'append' on 'Headers': Invalid name`; Node: `TypeError:Headers.append: "bad name" is an invalid header name.`
- `new URLSearchParams().append(Symbol('x'),'1')` browser: `TypeError:Failed to execute 'append' on 'URLSearchParams': Cannot convert a Symbol value to a string`; Node: `TypeError:Cannot convert a Symbol value to a string`.

A previous valid `new URLSearchParams('a=1').get('a')` continued to return `1` on both hosts. Source-level constructor validation alone did not constrain subsequent method effects.

## Proposed compiler behavior

**Candidate compiler patch:** `601b04b122a462e5cd6d71d19b7a1bc7fc4b7a39`, with the focused test through `6ddeec109891796c75891b592d1da089145b1e92`, on `agent8/sco-webidl-method-admission-20261123`. Source changes affect `src/sco-selective-partition.js`, the new focused test, and this intermediate report. The exact dispatch SHA must be read from the branch after documentation changes.

Within the existing `usesUnprovedRelocatedWebIdlConstructors` admission predicate, a directly constructed URLSearchParams or Headers instance must have an immediately consumed, directly called method with narrowly statically bounded literal arguments. For URLSearchParams, candidate read methods are `get`, `getAll`, `has`, and `toString`; candidate mutations are `append`, `set`, `delete`, `sort` with exact literal argument counts. Headers candidates are `get`, `has`, `append`, `set`, `delete`; header field names match a deliberately strict lowercase ASCII token subset. Arguments for value or query strings are printable literal ASCII. Unproved arguments, extra arguments, optional or extracted method calls, local instance aliases, instances returned directly, constructor retrieval from spelled global-object member or destructuring aliases, and lexically or module-scope shadowed host constructor names fail closed. The selected function-body guard receives explicit formal names plus relevant source-module bindings; the graph-body guard uses its ordinary declaration scanner.

The existing same predicate executes for both selected private exports/helpers and imported static ESM graph leaves. No application runtime checks, extra RPCs, or VM instructions are introduced. This predicts **zero new runtime operations**, but no measured performance bound follows. Conservative rejection reduces the set of eligible private programs; it does not prove whole-program cross-host equivalence, especially reflective constructor retrieval, mutable realm prototypes, or indirect dynamic call targets.

## Evidence available now

- Static source inspection confirms the explicit guard and both relevant private-source call sites remain in the compiler.
- In isolated evaluation of the **actual current candidate predicate text** with the repository's `collectBindings` and `isStaticKey` implementations and a minimal ESTree walker, **31/31 handcrafted cases** matched expected admission. The cases cover each admitted direct method, malformed inputs, extracted method references, instance and global aliases, global destructuring, lexical/formal shadows, and positive literal constructors. The focused CJS source and test also both passed V8 syntax parsing. These **remain isolated synthetic AST checks**, without Acorn parsing, actual compiler integration, strict JSDoc, or browser HTTP execution.
- Candidate `test/sco-webidl-method-host-browser.test.js` includes static selected-export and imported-ESM graph admission matrices, including formal and source-module constructor shadows; intended real Chromium original/emitted/Node positive pairs for `get`, `getAll`, `has`, `toString`, `append`, `set`, `delete`, `sort` and arithmetic; malformed-argument refusal controls; and authenticated RPC/unauthorized HTTP 403 checks. Eight method-family positives are batched into **one selected-private RPC/Chromium launch** to keep the focused job bounded. This expanded browser suite has **not executed** on the candidate source.
- A local **Node.js 22.16.0** execution of eight literal method fixtures (query getAll/has/delete/set/sort and header has/append/delete) matched the expected values **8/8**. This is native Node-only behavior, distinct from the intended emitted browser client and the Node 22.23.4 CI version.
- Local **Chromium 144.0.7559.96** could not start in this container: headless startup aborted with a GPU-process unusable error. No browser-native or generated-SCO evidence is derived from that failed attempt.
- No full compiler output was executed locally because the repository/dependencies could not be cloned into the constrained local runtime; GitHub connector source inspection and isolated predicate evaluation are the available verification here.
- Relevant Web documentation: [Headers](https://developer.mozilla.org/en-US/docs/Web/API/Headers) describes method exceptions for invalid names; [URLSearchParams](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams) lists public method contracts. These sources guide the candidate's bounded argument classes; they are not a cross-engine parity proof.

## Explicit acceptance decision and next action

**Required focused dispatch:** `.github/workflows/manual-validation.yml` on branch `agent8/sco-webidl-method-admission-20261123`, input `focused_test=test/sco-webidl-method-host-browser.test.js`; record the **exact checked-out SHA**, which must include the compiler patch `9ac01fbbbc5ddfcc3fff96de181aecff7390569e` and expanded test `6ddeec109891796c75891b592d1da089145b1e92`. The test source changed after the earlier report pin; do not dispatch the obsolete compiler-only SHA. Green must include Ubuntu real Chrome original/SCO/Node result and HTTP 403 controls, Windows static/graph checks, strict project/external/paired-budget JSDoc. A green would warrant guarded integration review and one current-source full acceptance gate; it would not establish the primary obfuscation security objective. Red requires retaining this candidate off main and triaging the actual failing case rather than describing it as fixed.

The available connected GitHub repository API in this invocation does not expose a workflow dispatch action. The test therefore remains **pending**, and no mainline merge or release claim is appropriate. The repo-wide decision remains **RELEASE-BLOCKED**.
