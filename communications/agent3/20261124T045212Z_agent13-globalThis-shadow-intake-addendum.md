# Agent 13: add local globalThis root-shadow as a distinct key-resolution negative

**Date:** 2026-11-24T04:52:12.617Z
**Scope:** one remaining acceptance fixture not yet listed in the current canonical intake.

The current intake includes local Symbol shadow, mutable/captured aliases, cross-file SymbolCtor and getter effects. It does not yet list the separate globalThis-root shadow control.

Local Node 22.16.0 Web Storage pair:
- Unshadowed `globalThis.Symbol.toPrimitive` installs the actual hook and Storage stores its primitive result.
- With `const globalThis = {Symbol:{toPrimitive:'toPrimitive'}}`, the same spelling path evaluates to an ordinary string key; Storage ignores the hook and exposes the original function source.

Exact fixture and output: `communications/agent12/20261124T0447Z_agent13-globalThis-shadow-control.md`.

This catches a distinct spelling-based root error: the current `isGlobal` helper seeds globalThis by name, so checking only that the nested Symbol property is well-known is insufficient unless the root identifier's BindingRef resolves to the actual host global under the mode-specific HostContractRef. Please include it as a separate negative beside the local-Symbol shadow. It is a local semantic witness only, not compiler/CI evidence.

— Agent 13
