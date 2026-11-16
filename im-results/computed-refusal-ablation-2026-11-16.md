# Computed-property refusal: isolated 2/2 coverage regression and unsafe global deletion

**Status:** Intermediate reproducible red/green ablation, 16 November
2026, Agent 15. This is a diagnostic of a security/compatibility
tradeoff. No compiler behavior is changed by the experiment.

## Question

A conservative cross-file owner-proof gate in `src/cross-properties.js`
refuses every unknown computed `MemberExpression` key unless it is
syntactically an inert primitive literal:

```js
if(node.computed && name===null && !primitiveInertKey(node.property))ambiguous=true;
```

That gate was added after actual untracked dynamic-loader witnesses.
[Agent 43's pinned frozen application finding](../communications/broadcast/2026-11-16T0735Z_agent43_integrated-yield-blocker.md)
documented a **2/2 to 0/2** private-key coverage regression in a six-module
source-observer-free diagnostic. The originally delivered source-observer
variant already declines 0/2 and must remain a negative case.

We tested whether the single broad rule is responsible and whether simply
removing it would preserve behavior. Both claims require empirical tests:
the original compiler also contains other independent source, constructor,
alias and runtime-loader guards.

## Reproduction

Run `node sims/computed-refusal-ablation.js` with project dependencies.
The script reads the actual `src/cross-properties.js` source at runtime,
asserts a unique exact source-line anchor and uses Node's CommonJS module
compilation and a **temporary in-memory module cache** to load a variant
with only that one line removed. It restores the module cache
after obtaining the diagnostic compiler. It never rewrites the actual
compiler file or distributes the unsafe alternative.

For the positive control, it reads the unchanged six ESM files in
`examples/application-challenge/before/` and uses the existing
`sims/application-challenge-observer-ablation.js` helper with `both`
observers deliberately ablated. That source variant is a separate
diagnostic application and must not be claimed as semantics-preserving
against the original observer-enabled source. The compiler options
are COO, `closedWorld:true`, deterministic `SEED`, identifier and
property renames enabled, strings disabled.

For the hostile negative control, the script creates two real ESM
modules. `state.mjs` exports an object with
`secretField:31`. The consumer imports it statically, then chooses
`"constructor"` from `globalThis.RUNTIME_KEY`, and retrieves the
`Function` constructor in **two computed hops**:
`({})[globalThis.RUNTIME_KEY]` yields the inherited `Object`
constructor; indexing that function again yields `Function`.
This dynamically compiles `return import('./state.mjs')` and inspects the
field names from the imported module. A static import graph does not
capture this second runtime import as a consumer.

## Final cross-platform and runtime differential pin

The fully checked version passed
[manual workflow 43828111130](https://github.com/FlareZ123/obfs/actions/runs/43828111130)
on Linux and Windows Node 22 at exact source commit
`fef230c9fa8341acf1a468555fca17d4a1c8b241`.
Both runners also passed strict project and `jsconfig.external.json`
JSDoc checks. The diagnostic compiler preserved **84/84 real native
ESM application outputs** with two renamed fields after removing the
line, while the hostile two-hop constructor witness produced the same
unsafe mismatch on both operating systems. The normalized source SHA256
was identical across OSes:
`2c4bd17f3ef3e54992347a328b18c5a06ede3517a8bb65ea6fa4cf68dcfa380f`.

This establishes a **scoped positive 84-case semantic result** for the
observer-ablated frozen app, together with a counterexample to the
general transformation. Neither finite set proves the broader safety
of removing the check. The source-line ablation is intentionally
unmerged as compiler behavior; only the standalone diagnostic script,
its tests and evidence should be merged.

## Pinned initial Linux/Windows observation

[Manual cross-reader gate 43827261905](https://github.com/FlareZ123/obfs/actions/runs/43827261905)
was green on Node 22.23.4 Ubuntu and Windows at
`9fb6cb8a83642ce123bcb57ad3139f7e8ca35dd7`.
Both runners agreed on the coverage and native/compiled malicious
output. The source checksum was originally computed from checkout bytes
and differed across CRLF/LF platforms; later code normalizes LF for
platform-stable reporting.

| Fixture | Original conservative compiler | In-memory one-line ablation |
|---|---|---|
| Observer-free frozen six-module application | **0/2** fields renamed | **2/2** fields renamed |
| Runtime two-hop computed constructor loader | **0/1** fields renamed | **1/1** field renamed |

Native and conservative hostile output:

```json
[31,["secretField"],31]
```

One-line ablated hostile output:

```json
[31,["_pbeed449ae47c"],null]
```

The attacker obtains a separately imported module namespace with a field
name different from the unchanged public object's original spelling.
A call that returned 31 for the original source now produces null in
the JSON rendering (the unrenamed field read is `undefined`). This is a
direct, observable **1:1 semantic violation** caused by accepting the
incomplete ownership graph. It is not a deobfuscation-security benefit.

## Interpretation

The wide check is the causal blocker of the frozen positive graph's key
coverage. Deleting it globally is demonstrably unsound under the required
dynamic-loader threat. Both conclusions were measured under exact
source substitution, rather than inferred from code shape.

A future implementation may attempt a carefully scoped receiver/value
proof for benign dynamic property keys, with held-out hostile
constructor-chain and source-observer controls. Prove that dynamic
keys cannot retrieve loader-capable values or escape outside the
known module graph. Imported/exported user APIs, aliases,
reflection and the host's prototype chain require special care.
No such safe narrower proof has yet been established here, and the
compiler's existing refusal should remain in place.

The result belongs in `im-results/`; it does not constitute established
tamper resistance, a general static deobfuscation bound, a universal
2.5× slowdown guarantee or SCO authorization.
