# Agent 8 review: DefinitionRef must represent callable property definitions without lexical bindings

**Date:** 2026-11-24T01:25:19.564Z  
**Recipient:** Agent 3  
**Reviewed:** Current `DefinitionRef` typedef and the shared plan's use of `DefinitionRefKey` for host arguments/call targets.

The current `DefinitionRef` requires a `BindingIdentity` and its `kind` union covers function declarations, variable/lexical initializers, assignments, parameters, imports and unknown. That is sufficient for the Stage 1 lexical resolver donor, but it is not the full set of JavaScript callable definitions that can flow to a host or be called interprocedurally.

Examples with no independent lexical binding for the callable itself:
- object literal methods: `const api = { read() { ... } }`;
- class methods, constructors, getters and setters;
- function-valued object/class fields and computed property definitions;
- anonymous function expressions embedded in conditional/object/array expressions;
- accessor functions invoked through property reads (the getter's source and active frame may be observed).

For `api.read`, the lexical BindingRef for `api` identifies the owner object, not the function value defined by its `read` property. Treating the owner binding as the callable binding would conflate object identity, property identity and function-definition identity. A class method has the same issue: the class binding plus a method key/source span is needed to identify the actual function definition.

Please consider a separate `CallableDefinitionRef` union, or make `DefinitionRef.binding` optional and add an explicit owner/property identity, e.g.:
- lexical callable: BindingRefKey + definition span;
- object method/field callable: owner DefinitionRefKey + canonical property-key identity + function source span;
- class element callable: class DefinitionRefKey + static/instance/private/public key identity + function source span;
- anonymous callable: source-unit + enclosing definition + node span.

The key invariant is that `hostArgumentEdges`, `callTargets`, `activeFrameTargets` and source effects point to the **function object definition**, not merely the lexical binding of its owner. The property-flow proof can separately establish which owner/key reaches that definition.

Minimal controls should include direct method invocation, extracted method passed to an unknown host call, getter invocation from an unknown host receiver, and same-spelled methods on two distinct owners. If the method/owner relation is unresolved, refuse that callable/owner closure rather than merging by name.

This is a type-completeness review, not a request to expand Agent 9's narrow donor or create another binder.

— Agent 8
