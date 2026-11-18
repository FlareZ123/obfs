# Existing-edge COO sharding: array-iterator semantic repair

**Agent 27, 18 November 2026. Intermediate compiler-correctness evidence.**

## Failing mechanism and bounded repair

The experimental `piggybackShards` decoder previously allocated a temporary
array of UTF-16 code units and returned `String.fromCharCode(...units)`.
ECMAScript's argument spread consults the array's mutable
`Symbol.iterator` method. An otherwise valid application can temporarily
replace `Array.prototype[Symbol.iterator]` before calling an exported
string-literal function. That source function returns its literal unchanged,
while the old generated decoder instead consumes the replacement iterator's
arbitrary values. This is a semantic mismatch in the supplied ESM graph.

The new decoder appends each reconstructed code unit directly to a primitive
string using `String.fromCharCode(unit)`, then returns the accumulated string.
It needs neither a temporary array nor argument-spread iteration, removing
the particular `@@iterator` dispatch. The compiler and example snapshot
were changed in `workplace/coo-piggyback-shards.js` and
`examples/coo-piggyback/after/app.mjs`.

`test/coo-piggyback-shards.test.js` now includes an actual two-module ESM
differential. Its already imported donor exports a function that installs
an iterator yielding only code unit 78 while the protected function runs.
Native and generated entry modules both return the same five-code-unit string,
including NUL and a lone surrogate. The test restores the iterator and
exercises the cached result. The previous decoder would return the single
letter `N` on the first call.

## Source-pinned verification

[Manual two-platform targeted run 44250113555](https://github.com/FlareZ123/obfs/actions/runs/44250113555)
passed at exact merged `main` SHA
`4d87cb8af38b513bbe5dffc4ca92182c50735622` (Node 22.23.4).
Both Ubuntu and Windows completed **7/7** piggyback ESM regressions,
the exact checked-in generated snapshot comparison, and strict JSDoc.
The preexisting four-file shard tests, snapshot, profile and their JSDoc
checks also passed. The run's targeted `48`-graph sample reported:

| Platform | Cold original/generated ratio | Cached hot-call ratio |
| --- | ---: | ---: |
| Ubuntu | 1.19627× | 1.12012× |
| Windows | 1.21228× | 1.15557× |

These sample medians cover only the checked-in small literal, native Node
ESM graph loading, and repeated memoized return calls. They do not
prove a universal 2.5× bound, worst-case 4096-unit first-use cost,
or browser parity. The previously recorded browser SIGILL remains unresolved.

## Security and remaining scope

The public donor mask and consumer payload remain recoverable by the existing
seedless source-only attacker, which passed in this same targeted run.
No increase in reconstruction resistance, domain authorization, or
tamper resistance follows. This repair also assumes the source program
does not replace the decoder's ambient `String.fromCharCode`, as the
experimental compiler explicitly documents. Source observation,
module-namespace enumeration, cyclic early calls and unreviewed host
effects remain outside its general proof envelope.

The targeted workflow was extended in place:
`.github/workflows/manual-coo-shards.yml`. It provides reusable
Linux/Windows parity, source-snapshot and profile checks without
creating another expensive full-suite gate.
