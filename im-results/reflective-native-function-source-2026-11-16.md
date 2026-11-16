# Reflective native function-source observation: compatibility investigation

**Agent 48, 2026-11-16. Classification:** intermediate, pending compiler-emitted Linux/Windows regression confirmation. This is a semantic-compatibility repair candidate, not evidence of stronger obfuscation resistance.

## Mechanism and bounded witness

Under the JavaScript `Function.prototype.toString` contract, a user-defined function's original lexical source text is observable. Direct `fn.toString()` is only one spelling. Equivalent accesses include `Reflect.get(fn, runtimeSelectedKey).call(fn)`, `Object.getOwnPropertyDescriptor(Function.prototype, runtimeSelectedKey).value.call(fn)`, aliases of these reflective methods, `Function.prototype[runtimeSelectedKey].call(fn)`, and a descriptor map returned by `Object.getOwnPropertyDescriptors(Function.prototype)`. Runtime-selected keys can be simple conditional expressions with a `toString` branch.

Four native Node 22 paths were executed independently on 2026-11-16: direct `Reflect.get`, descriptor retrieval, first-class `Reflect.get` alias, and `Reflect.getPrototypeOf(fn)[key]`. All four returned the same 73-character native source as `fn.toString()`. Their Node evaluation completed without exceptions. The JavaScript standard's exact-source obligation is summarized by [MDN Function.prototype.toString](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/toString).

The original `src/ast.js::observesFunctionSource` source-key recognizer covered statically resolved reflective calls, but a conditional `toString` key could evade its finite string recognizer; captured `Reflect.get`/descriptor helpers and computed function prototypes also provided unrecognized routes. If the compiler rewrites an observed function or its literals, code comparing exact `toString` output changes behavior.

## Committed candidate and tests

- `test/sco-source-observation.test.js`: separate native-versus-emitted observable-source cases for conditional `Reflect.get`, conditional descriptor retrieval, aliased reflective methods, computed function prototypes and bulk descriptors; a proved benign `Reflect.get({known:2},'known')` control preserves the ability to vary unrelated spelling.
- `test/sco-interfile-source-observation.test.js`: genuine HTTP-served, two-module ESM case: `entry.mjs` imports a function from `state.mjs`, obtains its source through a runtime-selected `Reflect.get` method, and compares the original with the delivered pair in independent Node processes.
- `src/ast.js`: declines source rewrites for reflective reads with unknown property keys; conservatively tracks simple first-class aliases of Reflect/Object getters, Function.prototype, function-prototype observations, and bulk descriptor inspection. Unknown keys are deliberately refused rather than guessed, so some valid obfuscation opportunities may be lost. The patch adds no emitted runtime helper or target-runtime computation.

A receiver-binding mistake in the earliest regression fixture was corrected. The actual native calls now use `.call(originalFunction)` after `Reflect.get`; earlier queued tests are not acceptable evidence of semantic failure without this correction.

## Verification plan and current limits

A corrected historical red candidate on `agent48-reflective-red-20261116` at `1501a8fbb95e001aebaf2d5b354690e57634ade6` retains the old compiler and a valid conditional-reflection fixture. Its [targeted workflow 43791947182](https://github.com/FlareZ123/obfs/actions/runs/43791947182) was queued when this note was first written. The final repair candidate on main at `08ca4ee0e245fa79dd4f0f36a0005b4138ec2cec` has [targeted workflow 43792288084](https://github.com/FlareZ123/obfs/actions/runs/43792288084) queued. Confirm both immutable-source outcomes and run a full test/typecheck/browser gate before promoting a validated release claim.

No arbitrary JavaScript alias, proxy, reflection, function source, or exact-dataflow completeness is established. This does not prevent source recovery from distributed files, tampering by a full-control attacker, or rehosting. Its intended contribution is avoiding observable semantic regression when the program itself asks for exact function source.
