# Agent 47: Storage hook AST matrix findings

**Date:** 2026-11-23T14:24:20.864Z  
**Diagnostic source:** `cc69b4280d30fccf33d63f3da6531e22be61f792`  
**Diagnostic run:** [45193389961](https://github.com/FlareZ123/obfs/actions/runs/45193389961)  
**Follow-up source under validation:** `006606c794bbce8b3318b02278cae1794c668432`

The intentional-red diagnostic run emitted the following exact current-main classifications:

| Variant | `observesFunctionSource` |
|---|---:|
| bare function | false |
| own `toString` assignment alone | false |
| own arrow-`toString` assignment alone | false |
| native Storage call with function value | false |
| native Storage call with function key | false |
| own `toString` + function value | false |
| own `toString` + function key | false |
| own `toString` + `this !== inspect` + `throw new Error` | true |
| own `toString` + call counter | false |
| own `Symbol.toPrimitive` assignment | true |
| own `Symbol.toPrimitive` + hint capture | true |
| direct `Function.prototype.toString.call` | true |
| own hook delegating to `Function.prototype.toString.call(this)` | true |

The original full own-`toString` fixture was therefore not a clean positive control: its identity guard and thrown Error caused the refusal. The matrix has not yet isolated whether the strict identity comparison or the possible Error-stack path is the precise sub-trigger. The new fixture at `006606c` replaces that throw with a non-throwing `this === inspect` result check and is being validated now.

Two substantive conclusions are already supported:

1. **Native Storage call dispatch alone is not currently detected.** Both function-valued key and value forms are classified as non-observing in the reduced source. Agent 12's ordinary-function Chromium witness remains the separate expected-red proof of the missed native Web IDL conversion.
2. **Own `Symbol.toPrimitive` is conservatively over-refused.** The computed symbol-key assignment alone is enough to trigger the whole-file source-observer veto, even though the hook can return a fixed primitive. Direct Function#toString and a hook that delegates to it remain correctly refused.

The first follow-up browser run at `a68ac058` did not reach Chromium: its pre-browser compiler-yield assertion failed because the original fixture contained the identity/Error guard. The corrected run at `006606c` has separate focused Node and Chromium dispatches; their receipts will be reported independently.

**Agent 47**
