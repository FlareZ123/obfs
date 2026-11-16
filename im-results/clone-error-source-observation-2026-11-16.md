# Source-bearing clone failures: reproducible Node 22 obfuscation semantics

**Classification:** Intermediate compatibility research, 16 November 2026. These experiments improve observable behavior preservation. They do not establish static reconstruction resistance, hostile-runtime integrity, or execution authorization.

## Mechanism and contract

Node 22 can place the **exact source spelling of a function** into the message of an exception raised while cloning or serializing that function. The same effect applies when a nested object contains a function. This gives code a source observer without a syntactic `Function.prototype.toString` call.

A minimal native witness:

```js
function inspect() { const privateValue = 17; return privateValue; }
try { structuredClone(inspect); } catch (error) {
  console.log(error.message);
}
```

The message contains the source of `inspect`. Altering its lexical spelling, string expressions, or references to private object properties changes an observable string. A compiler can preserve its arithmetic output while silently changing the error contract.

Equivalent source-bearing exceptions were observed for `require('node:v8').serialize(inspect)`, `Serializer#writeValue(inspect)` and `MessagePort#postMessage(inspect)`. The first three mechanisms are tested with real Node 22 APIs inside isolated `vm` contexts. The cross-file tests feed a function exported by another CommonJS module into a serializer, proving that a source sink in one file can constrain edits in another.

## Pinned red/green witnesses

| Mechanism | Original failing two-OS run | Repaired two-OS run | Scoped conclusion |
|---|---|---|---|
| `structuredClone`, direct, aliased, destructured, reflective and nested | [43961915147](https://github.com/FlareZ123/obfs/actions/runs/43961915147), 8/9 tests failed | [43962242659](https://github.com/FlareZ123/obfs/actions/runs/43962242659) at `16326be41e53652ed9a9a3b120289f85f3a7587d` | The recognized direct and forwarded calls preserve source diagnostics |
| `v8.serialize`, module aliases, destructured methods, indirect calls, interfile consumer | [43962675025](https://github.com/FlareZ123/obfs/actions/runs/43962675025), 9/10 failed | [43963172799](https://github.com/FlareZ123/obfs/actions/runs/43963172799) at `905c3fb9e0e42d625b0caefbf5fc209a6a8f9696` | The recognized convenience serializer paths preserve diagnostics |
| `MessagePort.postMessage` with a function payload | [43963488563](https://github.com/FlareZ123/obfs/actions/runs/43963488563), 2/3 failed | [43963717155](https://github.com/FlareZ123/obfs/actions/runs/43963717155) at `cc0d33c363664b308291ba761f705d081661c531` | The direct message-payload sink preserves diagnostics |
| Stateful `v8.Serializer` / `v8.DefaultSerializer` `writeValue` | [43965167670](https://github.com/FlareZ123/obfs/actions/runs/43965167670), 9/10 failed | [43965393329](https://github.com/FlareZ123/obfs/actions/runs/43965393329) at `71ae595b05ce6a602ccef714cdab69cdba44ec99` | Instance, alias, indirect, reflective and ESM-import recognition passes the targeted gate |

Each red gate includes a positive primitive-input control that remained safe for property renaming. Logs show the original message containing `hidden.secretField` and the incorrect transformed message containing a private hashed key and rewritten lexical variables. Ubuntu and Windows independently reproduced the difference.

The targeted gate `.github/workflows/manual-transform-safety.yml` runs all tests above on Node 22 for both operating systems, with strict JSDoc checks and other transformation-safety suites.

## Protected-work coverage

Declining an entire source group when every call to a clone API is classified as an unknown source sink can exclude genuine private code. `src/ast.js::isInertCloneInput` now accepts only a **direct inline array or plain data-object literal** recursively containing proven primitive expressions, including nested static records and array holes. It refuses unknown aliases, computed side effects, spreads, getters, methods, constructors and nested functions.

The four eligible examples in `test/clone-inert-payload-coverage.test.js` retain **1/1 eligible private-field renames** in each example while checking native/emitted output equality. Four unsafe source-bearing examples retain original code and exact diagnostics. The targeted two-OS [43964692405](https://github.com/FlareZ123/obfs/actions/runs/43964692405) at `6aacb6a7e13b11ddfeda51bade4a84dd4bad5c59` passed. This is **bounded positive transform yield**, not a measure of security advantage: the emitted field labels remain publicly inspectable.

## Implementation and reproducibility

The implementation is in `src/ast.js::observesFunctionSource`. It tracks recognized serializer aliases in a monotone flow set, including ESM named imports of `serialize`, `Serializer`, and `DefaultSerializer`; CJS `require('node:v8')`; direct constructors; bound methods; and selected `.call`, `.apply` and `Reflect.apply` forms. The source observer causes the compiler to withhold unsafe edits rather than introducing runtime integrity checks or intercepting browser APIs. A regression also ensures the ESM import discovery sets are initialized **before** their AST walk so an ESM import cannot trigger a TDZ crash.

Reproduction tests:

- `test/structured-clone-source-observation.test.js`
- `test/v8-serialize-source-observation.test.js`
- `test/message-port-source-observation.test.js`
- `test/v8-serializer-instance-source-observation.test.js`
- `test/clone-inert-payload-coverage.test.js`
- `test/clone-source-browser.js` for separate actual Chromium COO execution

For the above behavior witnesses, run the respective `node --test` tests; the browser harness uses the configured `CHROMIUM_BIN`. CI links include the exact source SHA, Node version, operating system and process logs. The actual Chromium COO module fixture passed [43966395403](https://github.com/FlareZ123/obfs/actions/runs/43966395403) at `fc519be90cd0bcdcda18176393a5e6bf183da372`: the source-error cases for `structuredClone` and `MessagePort.postMessage` matched native output with no unsafe edits, and the inert-record case retained 1/1 private-field renaming with native parity. The first browser run [43965793665](https://github.com/FlareZ123/obfs/actions/runs/43965793665) exposed an invalid positive control, because a classic `script` source intentionally has property renaming disabled by `src/core.js`. Corrected the fixture to use a real inline browser ES module and `sourceType:'module'`; the corrected full browser workflow passed, including its pre-existing integration cases.

## Limitations and next work

The source scan is finite and intentionally conservative. It does not prove equivalence through arbitrary host callbacks, dynamically generated method aliases, modified globals, indirect message channels, every `node:v8` serializer subclass, browser workers or error rendering across engines. The native error string is Node/V8-specific and the Chrome harness is a separate check. A determined attacker with all COO/SNO files can still execute and inspect the distributed code. These guards give no new confidentiality or authorization root.

No new work was inserted into the emitted hot path by the source-sink guard; the newly permitted inert-literal cases reuse existing transformations. This property is insufficient for a general **2.5× whole-session** claim. Use representative native/emitted app timing and independent static/runtime attackers before treating any compiler enhancement as an obfuscation-strength advance.

**Provisional research verdict:** source-bearing clone errors are a real, independently reproduced loss-of-semantics hazard. Bounded recognition and inert-input proof repair that hazard for the tested programs. Broader source observation, source recovery and hostile runtime threats remain open.
