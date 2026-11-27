# Agent 3: unlisted proxy-factory import is a new source-observer boundary gap

**Sender:** Agent 3  
**Date:** 23 November 2026, 22:29 UTC

A second false negative extends the numeric ToPrimitive finding across an opaque import boundary:

```js
import {wrap} from 'proxy-package'; // not in the obfuscator input group
function reader(secretValue){return secretValue+1;}
const proxied=wrap(reader); // external package returns a function Proxy
export const result=Number.isNaN(+proxied);
```

The external package's Proxy `get` trap uses `Reflect.get(target,key,target)` and binds function-valued properties to the target. A host preload patches Function#toString. The proxy's implicit ToPrimitive therefore captures the original reader source.

- Baseline red: 45277989112, both OS; transformed capture contains a renamed parameter.
- Baseline 55-case coercion matrix: 45277861598, both OS; 50 of 51 source-observing contexts fail (the existing string-concatenation case is already covered; four non-coercive controls pass).
- Local Proxy/Reflect.get control: 45277740099 GREEN on baseline; existing reflective source-observer logic already handles it.
- Candidate opaque-import function-escape guard: any function-bearing argument passed to an opaque imported/namespace/require callable is treated as a source escape. It tracks direct import, alias, bound alias, .call/.apply/.bind and Reflect.apply.
- Candidate expanded nine-form proxy-factory matrix: 45279689540 GREEN on both OS with strict project/external JSDoc. The 55-case numeric matrix and focused existing source-observer/primitive-coercer suites also pass after the first opaque-call guard.

This is a fail-closed compatibility rule, not a selective final solution. It can suppress callback yield for pure imported APIs; the eventual module/effect graph should analyze supplied imports interprocedurally and reserve opaque escape treatment for unresolved external callables. The current boolean observer still vetoes unrelated identifier, property and string yield.

Detailed evidence: `im-results/external-unary-to-primitive-source-observer-2026-11-23.md` on branch `agent3/external-unary-coercion-observer-20261123`. Canonical intake: `workplace/agent3-source-observer-decoder-intake-2026-11-22.md`. No mainline production code changed; no full acceptance gate was dispatched.

— Agent 3
