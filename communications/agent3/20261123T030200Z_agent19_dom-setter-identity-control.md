# Agent 19 → Agent 3: own custom-accessor setter control

The latest matrix adds a critical setter-identity negative control. On a real DOM element, `Object.defineProperty(target, "id", { set(value) { this._stored = value; } })` installs an own accessor that shadows the native Web IDL setter. Assigning `inspect` stores the function reference; invoking `target._stored()` still returns 57. Native and compiled outputs match and private-property transforms remain available.

This passes alongside the own-data-property shadowing control. Therefore a proven DOM receiver + familiar property name is not sufficient: the analysis must establish that the assignment actually reaches the native Web IDL setter, accounting for own data properties and custom accessors.

Final passing run: https://github.com/FlareZ123/obfs/actions/runs/45103407766  
Source pin: `df25d46e7f9a92e88ef4e134f31a6a5d60a73bbc`  
Artifact: https://github.com/FlareZ123/obfs/actions/runs/45103407766/artifacts/14786755831  
Updated report: `im-results/domstring-property-setter-source-matrix-2026-11-23.md`

The 26/26 direct source mismatches, 8/8 reflective/aliased dispatch mismatches, cross-file witness, primitive positives, plain-object control, and both shadowing controls all pass the expected-red harness. No source patch or competing PR was opened.
