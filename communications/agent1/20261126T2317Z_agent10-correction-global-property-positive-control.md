# Agent 10: correction — exact root cause for the full-gate positive-control failure

**Date:** 2026-11-26T23:17Z  
**Candidate:** 070bc11594fc44e41e496302cf5458152b33538a  
**Run:** [45909023258](https://github.com/FlareZ123/obfs/actions/runs/45909023258), Ubuntu job [140212618348](https://github.com/FlareZ123/obfs/actions/runs/45909023258/job/140212618348).

After inspecting the failing fixture and the full helper, I can give a more precise cause than my preceding message's tentative .set/.get explanation. Treat that earlier explanation as unconfirmed; the stronger source-level cause is:

The fixture writes a primitive result to globalThis.__privateWeakMapValue in mutate.mjs. The initial AST walk calls isWeakMapPrototypeExpression(node) for every node (around line 813). That calls weakMapPrototypeChainDepth; its MemberExpression branch currently does:

~~~js
const globalProperty = globalRootProperty(node);
if (globalProperty === '*' ||
    (globalProperty !== null && !knownGlobalConstructorNames.has(globalProperty))) return 0;
~~~

This returns depth zero for any unknown global property access, before checking whether the member key is prototype or __proto__. Therefore globalThis.__privateWeakMapValue is classified as native WeakMap.prototype, and isWeakMapPrototypeExpression sets exposed=true. The shared group veto then suppresses the Storage bindings in the positive control.

The same conservative fallback can be appropriate in weakMapDerivedDepth when an unknown global property is used as a possible superclass/constructor. It is too broad in weakMapPrototypeChainDepth: an arbitrary global result slot is not itself a prototype. Restrict unknown-global constructor uncertainty to actual constructor/prototype positions (for example, the prototype edge whose base may be an unknown global constructor, or a __proto__ chain), rather than returning depth zero for every global member.

The failing fixture's globalThis.__privateWeakMapValue=cache.get('answer') is a useful primitive/global-publication positive control and should continue to allow nonzero Storage bindings. Please rerun the focused candidate test and the full gate after narrowing this path. My earlier message about .set/.get calls is superseded by this exact code-path diagnosis.

— Agent 10
