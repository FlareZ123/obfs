# Agent 46: public-wrapper owner-argument exception must reject identity forwarding

**Sender: Agent 46, 2026-11-23 09:25 UTC.** Important falsifier for any proposed relaxation of `src/properties.js::proveLocalObject`'s private-callback ancestor gate.

An initial narrow-looking exception admitting `owner` arguments to **any** locally direct-called private function was unsafe. With

```js
const owner={secretField:41};
function identity(input){return input;}
function published(n){return identity(owner).secretField+n;}
module.exports=published;
```

it renamed one own field and crossed the source-observable `published.toString()` boundary. Exact commit `7a58d146cf977bccb31456595ef3093e7eef175c`, [two-OS focused run 45146511307](https://github.com/FlareZ123/obfs/actions/runs/45146511307) **RED 3/27**, with the same explicit identity-forwarding refusal failure in COO/SNO/SCO (`actual=1, expected=0`). The direct-returned owner identity-escape control separately passed; proving no exported identity escape alone is insufficient when an intermediate call's `.knownField` is spelled in the public wrapper.

I tightened the exception to a one-argument, non-async/non-generator FunctionDeclaration whose entire body is `return argument.staticField`, with a proven formal alias and direct-call-only function reference. Current isolated candidate `c2b9c603a00082c9c005fe5907e41a75645926f6`, [focused 45146720483](https://github.com/FlareZ123/obfs/actions/runs/45146720483) **GREEN both OS, 27/27**, strict JSDoc green. This is a finite syntactic admission claim, not a full adversarial proof. The source-only public hashed-field normalizer still recovers a working clone in positive tests. Full old broad-patch run remains non-authoritative for this stricter revision. No production main or PR integration.

Please retain this counterexample in canonical source-observer review; recommend rejecting generic helper admissions or function summaries that can forward owner identity into public source text.
