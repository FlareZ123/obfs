# Unresolved native Web IDL **method** error drift after constructor admission

**Agent 8, 23 November 2026. Status: RED-FIRST, UNPATCHED.** A limited but real source-pinned counterexample found after merging the bounded `URLSearchParams`/`Headers` **constructor** admission fix in PR #351. Preserve as a separate open problem. **No compiler fix or acceptance is claimed.**

The retained test-only branch `agent8/sco-webidl-method-host-20261123` has exact fixture source `df885ca4f15bfcbf3da90f2bdf2631fb1b118517`, [focused run 45255283045](https://github.com/FlareZ123/obfs/actions/runs/45255283045). It uses `partitionScoSelectedAsyncExports` with a real same-origin `createScoHandler` authenticated cookie, denied unauthenticated RPC HTTP403, live Chromium **157.0.8103.78** original module, generated browser RPC client and trusted Node.js **22.23.4** private function. The new constructor guard allows no-argument `new Headers()` and `new URLSearchParams()`, whose methods remain callable with dynamic/error-triggering arguments.

| Selected private operation | Native Chromium original | Generated SCO facade / private Node |
| --- | --- | --- |
| `try{new Headers().append('bad name','x');return 'ok'}catch(e){return e.name+':'+e.message}` | `TypeError:Failed to execute 'append' on 'Headers': Invalid name` | `TypeError:Headers.append: "bad name" is an invalid header name.` |
| `try{new URLSearchParams().append(Symbol('x'),'1');return 'ok'}catch(e){return e.name+':'+e.message}` | `TypeError:Failed to execute 'append' on 'URLSearchParams': Cannot convert a Symbol value to a string` | `TypeError:Cannot convert a Symbol value to a string` |
| `new URLSearchParams('a=1').get('a')` | `1` | `1` |

The first two live browser assertions fail **as expected** under the current compiler. The last proves a genuinely useful valid protected-work method call remains admitted and returns identical original/facade/server values. These are **method** failures, distinct from the invalid constructor inputs repaired by PR #351.

**Required future action:** build a conservative proof for calls on directly constructed, safely initialized host objects. Confirm dynamic/malformed method arguments are refused while retaining native parity for fixed valid `.get('a')`, header `.get('x-demo')`, query `.toString()` and ordinary independent protected work. Apply to selected exports/helpers and imported private static ESM. Instrument source-alias and method-extraction cases. Test red-first and green in a real generated browser HTTP path with 403 negative control, two OS focused/JSDoc, then evaluate full-suite integration. Do not merge this intentionally RED test into `main` until the behavior is corrected and useful positive yield demonstrated.

Earlier [PR #351](https://github.com/FlareZ123/obfs/pull/351) merged source-pinned **constructor-only** guard `55bdfbdbbc387cc9fa2af381046a4160afc6c971`. This new experiment neither retracts its narrower correct rejection cases nor establishes full semantic equivalence. **RELEASE-BLOCKED** remains authoritative, including the independent comprehensive main red 26/5,237 on both OS at [45250108841](https://github.com/FlareZ123/obfs/actions/runs/45250108841).
