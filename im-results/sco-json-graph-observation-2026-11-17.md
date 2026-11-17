# SCO JSON RPC observational-equivalence boundary

**Date:** 2026-11-17. **Classification:** intermediate executable
counterexample, not a strong-obfuscation result.

## Contract and question

The explicit `partitionScoAsyncModule` contract accepts server-resident async
ESM exports with JSON-compatible argument/result transport. Its generated
browser ESM facade calls `JSON.stringify({method,args})`, while
`createScoHandler` parses that JSON and serializes `{ok:true,value:result}`
with `JSON.stringify`. Consequently, a tuple of individually JSON-serializable
objects is insufficient to guarantee native JavaScript equivalence when the
original method observes *argument identity*. Special numeric values and
undefined array elements present separate representation losses.

## Executable witness

[The real HTTP regression](../test/sco-json-observation-boundary.test.js)
constructs the production partition, binds the actual original ESM exports,
serves its generated facade using the production handler on loopback, imports
the generated facade, and compares observations with direct calls. A
shared-reference array `a=[-0,undefined,7]` is passed in both
argument positions:

| Observed property | Direct source | Actual JSON RPC |
| --- | --- | --- |
| `a===b` | `true` | `false` |
| `Object.is(a[0],-0)` | `true` | `false` |
| `a[1]===undefined` | `true` | `false` |
| `a[2]===7` | `true` | `true` |

An even smaller counterexample uses an ordinary acyclic plain object `x` and
`async echo(value){return value}`. The direct result compares `=== x`, while
the generated RPC result has equal JSON contents and a new reference. This
loss occurs with one argument and entirely JSON-compatible primitive leaves.
For a cyclic object, the direct echo resolves to the original reference and
the generated facade rejects at `JSON.stringify` before the HTTP operation.

A separate direct result `{finite:7,nan:NaN,negative:-0}` arrives as
`{finite:7,nan:null,negative:0}`. An independent pair of ordinary acyclic
JSON arrays is a positive control with equal direct and RPC results.

**Scope:** The JavaScript source transformations are not implicated.
These observations arise from the public JSON transport format. Identity
loss occurs even when every individual input object is an ordinary array
or plain object and has no cycle. This is particularly relevant for future
claims about behavior-preserving partitioning of general JavaScript
programs. The witness is intentionally a passing *known limitation* test,
not a claim that transport parity is solved. It does not evaluate an
adversarial client, source confidentiality, online relay, or the 2.5x runtime
budget.

## Practical boundary

The present RPC contract should specify JSON trees without identity-sensitive
cross-argument references and restrict values to the JSON representable
subset. Implementations requiring `NaN`, infinities, signed zero,
`undefined`, `BigInt`, cycles, symbol keys, custom prototypes, or reference
identity need a separately measured serialization protocol and new
differential tests. Merely adding syntactic AST support for more async
functions would silently widen the unsafe acceptance set. Any replacement
format needs explicit compatibility and cost evidence against native and
ordinary minified applications. The current generated facade must not be
described as universal 1:1 JavaScript semantics.

## Reproduction

From the repository root after installing dependencies:

```powershell
node --test test/sco-json-observation-boundary.test.js
```

The exact produced facade is generated at test time from the repository code;
the test verifies that original private function bodies are absent from the
delivered client file. Record exact source SHA and green Windows/Linux Node 22
workflow before using the witness as checked integration evidence.
