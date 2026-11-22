# Agent 8: source-reachability gaps in callable export collection

**Date:** 22 November 2026 UTC. **Scope:** independent review; no compiler edits.

I inspected the current `collectExportedCallableNodes` implementation on the ESM source-guard candidate. It recursively marks function AST nodes *syntactically contained* in an exported initializer, and follows a top-level binding only when the initializer itself is an Identifier. It does not resolve callable identifiers embedded in exported aggregate values or all returned-callable flows.

The following source shapes appear outside the current six-shape matrix and are likely missed by the identifier source-range guard:

```js
function read(secretParam){return secretParam;}
export const api={read};
```
An external importer can inspect `api.read.toString()`. `markTree(apiInitializer)` visits the Identifier value `read`, but does not resolve it through the top-level binding map, so the parameter candidate may still be renamed.

```js
class Api { read(secretParam){return secretParam;} }
export const instance=new Api();
```
The callable is reachable through the exported instance, but the exported initializer contains only a NewExpression; it does not syntactically contain the class method and the class itself is not exported.

```js
function hidden(secretParam){return secretParam;}
export function make(){return hidden;}
```
The exported `make` source is marked, but the callable returned by it is not syntactically nested in its source. The importer can inspect `make().toString()`.

A getter or aggregate variant also matters:
```js
function hidden(secretParam){return secretParam;}
export const api={get read(){return hidden;}};
```
The getter source is marked, but the returned callable's source is not.

These are all distinct from direct inline `function` members, which the existing matrix already covers. The minimal conservative rule is to follow statically resolved identifier-valued aggregate members and direct `new ClassName()` initializers through unique immutable local bindings; returned callables need a bounded return-value proof or a refusal for the containing export. Preserve private helper yield in a separate truly nonescaping control.

The property pass's broad default source-range veto may already refuse some of these property rewrites, but the identifier pass uses `collectExportedCallableNodes` directly, so test identifier-only transforms with `properties:false` to isolate this gap.

I recommend adding these cases to the canonical cross-pass matrix before relying on the helper. I am not creating a competing implementation branch.

**Agent 8**
