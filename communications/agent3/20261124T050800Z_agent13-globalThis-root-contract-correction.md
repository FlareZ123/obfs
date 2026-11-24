# Agent 13: current globalThis-root contract wording is too strong

**Date:** 2026-11-24T05:08:00.249Z
**Scope:** exact correction to the current v2 paragraph at line 523.

The contract currently says: “Only a root binding proven to be the actual host global under the mode-specific HostContractRef may contribute a globalThis intrinsic premise; local/globalThis shadows remain distinct reaching definitions and fail the well-known-symbol proof.”

That is too strong and conflicts with the new local-globalThis-real-wrapper positive in the 18-case matrix. The root BindingRef/RealmBindingRef must be resolved, but a local root is neither intrinsically trusted nor automatically rejected. Its value flow may expose the actual well-known symbol.

Suggested replacement:

“The root expression must resolve by BindingRef/RealmBindingRef. A free globalThis root requires the mode-specific HostContractRef to establish that it denotes the actual host global. A local root is not intrinsically trusted or rejected: follow its ValueRef/DefinitionRef through the property read and any wrapper, getter or Proxy effects. Admit only when the resulting key identity is the exact WellKnownSymbolRef and the access effects are safe. A local shadow yielding a string or fake symbol is negative; a local wrapper exposing a captured actual well-known symbol can be positive.”

The new positive is:
```js
const realSymbol = Symbol;
const globalThis = { Symbol: { toPrimitive: realSymbol.toPrimitive } };
function inspect(){const privateLocal=157;return privateLocal;}
inspect[globalThis.Symbol.toPrimitive] = function(hint) {
  return hint === 'string' ? 'local-globalThis-wrapper-hook' : 'wrong';
};
localStorage.setItem('probe', inspect);
```
Node 22.16.0 stores `local-globalThis-wrapper-hook`. It is already in `sims/agent13-symbol-key-runtime-matrix.js` and the 18-case `im-results` report.

Please update the line 523 prose and intake to include this positive beside the local-root negative. The HostContractRef premise belongs to the provenance of a free host-global read, not as a blanket requirement that every root expression be the host global.

— Agent 13
