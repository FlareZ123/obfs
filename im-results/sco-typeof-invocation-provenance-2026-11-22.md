# SCO composite `typeof` invocation provenance, 22 November 2026

## Scope and status

A bounded build-time admission correction in `src/sco-selective-partition.js`.
The selected-private and audited static-ESM graph code paths both call
`firstUnprovedTypeofReference`. Their previous laziness check only recognized
an enclosing `CallExpression` when scanning function bodies inside the
operand of `typeof`. An immediately constructed function and an immediately
invoked tagged function were therefore incorrectly treated as lazy. The
correction identifies a directly invoked AST function node by its **immediate
parent's child identity**: `CallExpression.callee`, `NewExpression.callee`,
or `TaggedTemplateExpression.tag`. A call elsewhere inside an uninvoked
function body no longer incorrectly marks that outer function as executed.

## Native Node 22 two-realm witness

Executed locally with Node `node:vm.runInNewContext` twice, providing
`{externalBridge:{value:41}}` in one context and an empty context in the
other. Result format: original expression -> injected / empty context.

| Expression | Injected | Empty |
|---|---|---|
| `typeof new (function(){return externalBridge;})()` | `object` | `ReferenceError: externalBridge is not defined` |
| `typeof ((strings)=>externalBridge)\`tag\`` | `object` | `ReferenceError: externalBridge is not defined` |
| `typeof (()=>{Math.imul(6,7);return externalBridge;})` | `function` | `function` |

This witness establishes a cross-realm **potential** when unqualified host
globals differ, not a literal browser-to-Node deployment proof. The last row
is a matched positive control: constructing a lazy function does not execute
its body even if that body contains an unrelated call.

## Compiler before and after

The prior exact red branch was
`agent36/sco-typeof-nontcall-constructor-red-20261122`, commit
`d231dc27f33f4fdc13f14b48ec2350dfb1f57143`.
[Red-first SCO graph workflow 45001117387](https://github.com/FlareZ123/obfs/actions/runs/45001117387)
failed Ubuntu because the constructor source was admitted where a refusal
was required. The tagged source was unreachable after the first assertion
failed, so the historical run is **not** evidence about that tag case.

The correction and seven regressions across selected/direct and two audited
transitive private-graph depths are on
`agent36/sco-typeof-new-tagged-20261122`, source + test commit
`4b3ac8a2e1dfeceb2924bb713fc5be0613532cc7`.
[Targeted graph workflow 45004530815](https://github.com/FlareZ123/obfs/actions/runs/45004530815)
completed **successfully on Ubuntu and Windows**. The workflow includes
existing private-source graph and handler tests, generated example checks,
and strict JSDoc. The new negative test rejects two expression classes in
both compilation entry points and each of two transitive depths. The new
positive test preserves a lazy function with a nested `Math.imul` call and
an unexecuted free variable.

The change is build-time static source admission only. It adds no obfuscated
runtime instructions and therefore no generated runtime compute overhead for
the same admitted source. It may conservatively refuse sources it previously
accepted, which is an intended compatibility boundary.

## Limits and integration context

This is an exact syntactic improvement, not a generalized proof of JavaScript
execution or cross-realm semantic parity. Indirect invocation, exotic
constructor behavior, dynamic calls, and free global reads outside the bounded
`typeof` path remain separately unproved. Agent 40 is developing a broader
lexical-scope reference preflight on an independent branch; integration must
compare its diagnostics and retained positive protection yield instead of
assuming this local check supersedes that candidate.

The project's source confidentiality, online same-authority cloning,
full-control adversarial tampering, and universal 2.5× CPU requirements
remain **RELEASE-BLOCKED**. No specific source or integrity hardening claim
follows from this compatibility correction.
