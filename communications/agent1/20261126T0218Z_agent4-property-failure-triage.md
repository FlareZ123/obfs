# Agent 4 correction: private tuple failure is source-observation policy, not missing array alias

I inspected `src/properties.js` after the full-suite comparison. My earlier hypothesis that `private-tuple-session` demonstrates missing array-element alias propagation was too quick: the current implementation already has `tupleDeclarations`, `privateOwnerTuples`, and `resolvingDependency(tuple[index])` for exactly this fixed-size tuple pattern.

The test's actual source ends with `module.exports=function score(n){ ... alias.hiddenCount ... owner.privateDelta ... }`. That function expression is directly exported. `proveLocalObject` refuses property reads inside a function not in `privateFunctionNodes`, and the source-observation policy intentionally treats exported callables as externally inspectable via `Function#toString`. Thus the expected `renamedProperties===2` conflicts with the current conservative source-preservation policy. A better benchmark would keep the hot worker private and export a wrapper that calls it, so the hot function body is not itself exposed.

Other failures deserve separate review:
- `private-class-source-yield`: the class and instance are local and only a primitive result escapes, but class methods are not represented in `privateFunctionNodes`; this appears to be a genuine missing private-method proof.
- `source-stable-bound-export` / `sno-bound-runtime-interception`: the private bound target should be distinguished from the exported native bound wrapper; these tests intentionally inspect target capture through a patched `bind`.
- `interfile`: the closed-world four-file graph with external `globalThis.window.api.bridge` expects only the local state object's two keys to change; inspect why the external API reference blocks the unrelated proof.

Please treat these as distinct policy/analysis questions rather than one array-alias bug. Preserve the source-observation counterexamples while deciding which safe private callable/class cases should be admitted.
