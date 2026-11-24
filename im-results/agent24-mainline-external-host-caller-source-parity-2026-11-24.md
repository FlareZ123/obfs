# Current-mainline reproduction: external host caller observes renamed private helper source

**Status:** exact current-mainline semantic source-parity failure in all three obfuscation modes. This is a focused reproduction, not a comprehensive-suite result or a claim that the callback is available in every deployment.

## Source pins

- Mainline base before adding the witness: `a4c838b9cfa6a89f910b18deb4732692701f8809`
- Test-only branch: `agent24/mainline-external-host-caller-recheck-20261124`
- Test-only commit: `5934f00253832c61369c1f1a2e536088a8229e8d`
- The exact base-to-test comparison is one file only: `test/agent24-mainline-external-host-caller-source-witness.test.js` (55 insertions, zero deletions). No production source changed between the tested mainline base and test commit.
- Focused workflow: `manual-validation.yml`, `focused_test=test/agent24-mainline-external-host-caller-source-witness.test.js`
- Run: [45432671727](https://github.com/FlareZ123/obfs/actions/runs/45432671727)
- Node: 22.23.4 on Ubuntu and Windows.
- Both OS jobs completed the same three mode cases; **COO, SNO, and SCO each failed** at the exact function-source comparison.

## Witness

The compiled source contains:

```js
function hidden(){
  const owner={secretField:41,otherField:2};
  getExternal();
  return owner.secretField+owner.otherField;
}
function publicReader(){return hidden();}
module.exports=publicReader;
```

The test constructs `getExternal` outside the VM/source graph using a sloppy function:

```js
return function externalCaller(){
  receiver.caller=arguments.callee.caller;
}
```

The callback runs synchronously inside `hidden`. It captures the active helper function object. After the exported reader returns, the host realm calls `Function.prototype.toString.call(caller)`.

The original observed helper source is:

```js
function hidden(){const owner={secretField:41,otherField:2};getExternal();return owner.secretField+owner.otherField;}
```

The emitted helper source is:

```js
function hidden(){const owner={"_p2928ab9876":41,"_p2f075957cd":2};getExternal();return owner._p2928ab9876+owner._p2f075957cd;}
```

The test first asserts that the runtime numeric result is unchanged; that assertion passes. It then asserts exact helper-source equality; that assertion fails in all three modes on both OS runners. The final zero-property-metrics assertion is after the failing source assertion and therefore was not reached. The emitted source itself demonstrates that both object keys and both corresponding reads were rewritten.

## Why lexical privacy is insufficient

The helper is not exported and its in-file binding is used only as a direct call from `publicReader`. The current local proof can therefore classify it as private. The host callback's caller inspection is wholly outside the supplied source graph:

- it creates no additional AST reference to `hidden`;
- it does not contain a source-reader expression in the compiled files;
- it executes while `hidden` is active and captures the actual function object;
- it reads the function source after the helper returns.

A direct-call-only lexical-use inventory cannot see this observer. The source-visible scanner for explicit `Function#toString`, `caller`, `arguments.callee`, and `Error.stack` syntax therefore does not establish non-observability under arbitrary host callbacks.

This independently rechecks Agent 9's earlier isolated-branch finding (`im-results/agent9-external-host-caller-private-property-source-gap-2026-11-23.md`) against a current-mainline source pin. It is not merely a stale branch result.

## Scope

- **Established:** with the tested Node 22.23.4 CommonJS runtime, a sloppy external callback can capture a running helper through `arguments.callee.caller`; current mainline rewrites fields inside that helper in COO, SNO, and SCO; numeric behavior remains equal while function source differs.
- **Not established:** that every browser host callback exposes legacy `.caller`, that every strict ESM helper is observable by this exact mechanism, or that this one fixture characterizes every host environment. V8 `Error.stack`/CallSite inspection is a separate route and has its own strict-function witness in Agent 39's prior work.
- **Not established:** a remote exploit, static-deobfuscation resistance, or an attack against the SCO server. The result is a semantic-preservation failure under an injected host callback, and a source-confidentiality limitation under the stated instrumented-runtime threat model.
- **Not a full acceptance run:** this was a focused two-platform test. It does not replace Agent 10's comprehensive gate or resolve the 2.5× budget.

## Required proof-boundary response

For any function whose source is considered protected, an unknown synchronous external call should be treated as a potential ambient caller/stack observer unless a trusted host-capability contract explicitly excludes that behavior. Candidate remedies:

1. Add an explicit ambient caller/stack observation effect to the function/source-observation closure model and propagate it through call edges, callbacks, aliases, and returned function values.
2. Default unknown free calls inside a candidate-private callable to an observation/escape veto; allow only individually reviewed callbacks with a host contract that rules out caller and stack inspection.
3. Keep the contract runtime-specific. A strict-mode requirement may disable legacy `.caller` access, but it does not by itself rule out V8 stack/CallSite observation.
4. Add this exact test as a regression after the proof boundary is repaired. Keep the test on the research branch while it is red; do not merge a knowingly failing test into main.
5. Re-run source parity for Node CommonJS, browser script/ESM host callbacks, and all three modes, then run the full suite and budget gates separately.

**Disposition:** current mainline's local private-function property proof is not source-parity-safe under arbitrary external synchronous callbacks. Keep the relevant modes / callable shapes release-blocked until the host-observer boundary is explicit and tested. Do not claim the finite direct-`Function#toString` COO plan alone closes this separate ambient-caller path.
