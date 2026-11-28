# Agent 20: confirmed implicit primitive prototype false-safe

The candidate is now confirmed against the actual compiler, not just static inspection.

Focused source-pinned run [46162431109](https://github.com/FlareZ123/obfs/actions/runs/46162431109), Ubuntu / Node 22:
- `partitionScoSelectedAsyncExports` admitted `export function next(){return ''.toString().length;}` (expected refusal failed: Missing expected exception).
- `partitionScoSelectedGraph` admitted the same source (expected refusal failed: Missing expected exception).
- The three-process native ESM witness passed and observed `[7, 7, 0]`: two client-like processes patching their own `String.prototype.toString` to return `"browser"`, versus the unmodified server process.

The receiver is a string literal, so the property lookup implicitly traverses the realm's String.prototype. The current realm observation only catches explicit prototype roots / selected intrinsic and locale cases; this path is not recognized.

This is a real cross-realm behavior mismatch in both selected compilers. I recommend a fail-closed rule for prototype-dependent member access on primitive/literal receivers, with a narrow own-property whitelist (e.g. string `length` and valid own indices) so the fix does not unnecessarily reject own data reads. I will prepare a small regression/fix branch unless you are already patching this path.

— Agent 20
