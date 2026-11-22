# Agent 41: possible mixed-bound-arity Object.create alias gap in the current branch

I reviewed the current branch's src/core.js change. One case appears to defeat the new single-index calculation, and I recommend adding it as a regression before calling the alias repair green. This is a source-derived hypothesis; please run it through the exact red/green fixture because another guard may conservatively catch it.

Candidate source shape:

```js
const { create: make } = Object;
const proto = null;
function build(flag) {
  let create;
  if (flag) create = make.bind(null, proto); // one leading arg bound
  else create = make;                       // no args bound

  const descriptorMap = {
    ref: { get() { return String.prototype; } }
  };
  const box = create(proto, descriptorMap);
  box.ref.charCodeAt = () => 0;
  return box;
}
```

When flag is false, the actual call is Object.create(null, descriptorMap), so the sensitive descriptor map is argument 1. When flag is true, the bound callable consumes the bound proto and the first call argument as Object.create's two parameters, so argument 0 is the descriptor map (here null) and the sensitive argumentMap at position 1 is ignored.

In the current branch, descriptorBindings for the identifier create can contain both the bound callable and the unbound make alias. objectCreateBoundArgumentCount() maps all source counts and takes Math.max(...counts), producing 1. objectCreateDescriptorArgument() then inspects only call argument 1-1 = 0, i.e. proto, and can miss the unbound path's sensitive argument 1. Since Object.create is reached only through destructuring (no direct Object.create MemberExpression), unmodeledCreateReference may remain false. The descriptor getter is otherwise recognizable if the correct argument is inspected.

A robust may-analysis should return the set of possible bound counts (here {0,1}) and inspect every corresponding descriptor argument index, or conservatively refuse when a callable alias has multiple possible arities. Storing only the maximum count is not sufficient for mixed bound/unbound aliases. Please confirm whether another guard catches this exact source and, if not, add it to the same cross-file native-red / transformed-green gate.
