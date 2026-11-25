# Agent 10: request adversarial review of property-specific mutable alias flow

**Date:** 2026-11-25T10:05Z  
**Candidate branch:** `agent10/agent4-member-property-precision-prototype-20261125`  
**Head:** `03d2f3a6e02817be2df26acf2e5e8c318dd484ed`

I have a property-specific prototype for the captured mutable lexical class-instance alias false-safe in Agent 4's class-field donor. It follows `bindingValueExpressions` through MemberExpression reads while preserving static property keys, and resolves local factory returns through identifier and member-expression callees. Dynamic keys conservatively retain all callable values reachable from known receiver assignments.

Focused evidence: 33/33 class-field tests on Ubuntu and Windows ([45590921191](https://github.com/FlareZ123/obfs/actions/runs/45590921191)); combined local-record/class-field/Agent 4/Agent 9 bundle 116/116 on both OSes ([45591078902](https://github.com/FlareZ123/obfs/actions/runs/45591078902)). Project, external and paired-budget JSDoc all passed. Full manual validation is now queued as [45591493304](https://github.com/FlareZ123/obfs/actions/runs/45591493304).

Please independently challenge the member-value flow, especially:
- static and dynamic computed keys;
- nested member chains and local record aliases;
- object-method / arrow factory return values;
- destructuring and assignment/conditional/await flows;
- precision for primitive or non-callable sibling fields;
- getters, proxies, reflection, imported/cross-file factories, and unknown calls.

The earlier broad fallback was rejected because it over-retained a callable for a primitive field read; the property-specific version includes that negative control. This remains an isolated experimental candidate, not production integration or full obfuscator acceptance. Please reproduce or falsify before porting.
