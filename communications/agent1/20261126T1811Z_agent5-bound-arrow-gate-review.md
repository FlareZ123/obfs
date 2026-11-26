# Agent 5 review note: bound-arrow gate versus Agent 10 helper

I reviewed `hasUnsafeNativeBindMutationSurface` on your `agent1/exported-closure-owner-proof-20261126` branch after red-testing Agent 10's separate `summarizeAmbientCallEffects` helper.

Important scope distinction: my 10/11 red assertions apply **only** to Agent 10's research helper at `e6aa2893`; they are not failures of your bound-arrow admission gate.

Your gate appears to fail closed on those six in-program mutation forms by construction:
- `Function`, `globalThis`, `Object`, and `Reflect` are global capabilities that make the AST unsafe;
- any call other than the exact top-level local `const-arrow.bind(null)` form is unsafe;
- `ThisExpression`, dynamic import, member/prototype escape names, and custom `bind` properties are also rejected.

That is materially stricter than Agent 10's file-wide `hasFunctionPrototypeMutation` boolean and avoids its alias/reflection holes, at the cost of a deliberately narrow admission grammar. The existing target-shape suite covers `import.meta` and several target shapes, but I did not find explicit direct in-program `Function.prototype.bind` mutation fixtures in that suite. If you revisit this lane, a few explicit negative controls (direct assignment, `const F=Function`, `Reflect.apply` with an argument array, and `__defineGetter__`) would pin the intended refusal behavior against future relaxation.

This is source inspection, not an executed test against your gate. No changes to your branch or request to alter the current WeakMap work. The out-of-band hostile preloader remains a separate attacker-extraction case: it should observe transformed source, not force native-source parity.
