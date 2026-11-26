# Bound constructor target extraction from exported native wrappers

**Research state:** intermediate adversarial finding, 26 November 2026  
**Reviewer:** Agent 3  
**Candidate branch:** `agent1/exported-closure-owner-proof-20261126`  
**Candidate code head reviewed:** `3fd4bd298750cdc3287ddce1542abc0569d5c0e9`  
**Reproduction branch:** `agent3/agent1-bound-constructor-extraction-20261126`  
**Reproduction commit:** `bb12fc53120e5d33e99329d49fe5bff273e3c759`  
**CI:** [focused manual-validation run 45832136174](https://github.com/FlareZ123/obfs/actions/runs/45832136174), Node 22.23.4, Ubuntu/Windows/macOS, all passed.

## Finding

The native-bound-target admission accepts a constructible ordinary function declaration when its only source-visible use is a top-level `internal.bind(null)` call. The exported bound wrapper remains constructible. A consumer outside the supplied graph can recover the supposedly private target without a preloader:

1. Construct the exported bound wrapper with `new hot()`.
2. The bound function's `[[Construct]]` forwards construction to the original target and uses the target's `prototype`.
3. The new instance therefore inherits from `internal.prototype`.
4. The ordinary `prototype.constructor` property points back to `internal`.
5. `Object.getPrototypeOf(instance).constructor` returns the original target function object. Calling `Function.prototype.toString` on it exposes the transformed target source.

The current `new.target` veto does not catch this path: the target body need not mention `new.target`. The scanner's `NewExpression` veto only sees new expressions in the supplied source graph; the consumer's `new hot()` occurs outside it.

## Reproduction

The source fixture is intentionally minimal:

```js
const owner={secretField:7};
function internal(){return owner.secretField;}
export const hot=internal.bind(null);
```

The test `test/agent3-bound-constructor-target-extraction.test.js` constructs `hot` externally, retrieves `Object.getPrototypeOf(instance).constructor`, and reads the recovered function source.

Run 45832136174 passed on all three focused platforms and also passed project JSDoc checks. The exact Ubuntu output was:

| Mode | Native target source | Recovered emitted target source | Property rewrites |
|---|---|---|---:|
| COO | `function internal(){return owner.secretField;}` | `function internal(){return owner._p2413a2afaf;}` | 1 |
| SNO | `function internal(){return owner.secretField;}` | `function internal(){return owner._p509da4525e;}` | 1 |
| SCO | `function internal(){return owner.secretField;}` | `function internal(){return owner._pe6481ab0cf;}` | 1 |

All three modes returned the original value `7`. The recovered function name remained `internal`, the wrapper name remained `bound internal`, and wrapper length remained `0`. This is a successful source-extraction witness, not a behavior-parity failure: the recovered body contains the transformed key rather than the original spelling.

## Assessment and recommended disposition

- The target is private only with respect to source-visible references in the supplied graph; it is not inaccessible to an external consumer of the exported bound wrapper.
- Ordinary constructible function declarations and function expressions should not be described as private bound targets under this public API shape.
- If the intended benefit requires preventing ordinary consumers from recovering the target function object, conservatively refuse constructible targets. Nonconstructible arrows avoid this particular `new hot()` / `prototype.constructor` route; any alternative admission still needs separate source-observer and host-preloader analysis.
- If the feature is intentionally only a property-renaming compatibility optimization and makes no source-secrecy claim, retain the transformation only with an explicit limitation that external construction of a bound wrapper reveals the transformed target source. Do not treat the target as a runtime secrecy boundary.
- This finding does not show that the original property spelling is recoverable from the transformed source. It shows that the emitted target function itself is recoverable without a hostile preloader, and that the existing hostile-preloader limitation is not the only extraction route.

This report does not authorize release or establish resistance to dynamic analysis. The primary strong-protection objective remains independently gated by the repository's other release blockers.
