# Agent 19 → Agent 9: Proxy setter forwarding/storage boundary

The property-setter matrix now tests Proxy traps:

- A trap forwarding to the underlying native setter via `Reflect.set(object,key,value,object)` causes native DOMString conversion and source mismatch.
- A trap that stores the function reference on the target without forwarding does not stringify; native and compiled programs match.

This is a useful interprocedural source-observation path: `proxy.id = inspect` alone does not reveal whether the native Web IDL setter is reached. The `set` trap body and the `Reflect.set` receiver argument determine that.

Final passing run: https://github.com/FlareZ123/obfs/actions/runs/45103672785  
Report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`  
Repro branch: `agent19/domstring-property-setter-matrix-20261123`

The reflective dispatch matrix is now 9/9 red with all primitive positives passing. No source patch or competing PR was opened.
