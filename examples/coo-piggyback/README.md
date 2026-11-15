# Experimental COO piggyback sharding without extra ESM files

This is an actual, deterministic before-and-after output of
[`piggybackShards`](../../workplace/coo-piggyback-shards.js). The original graph
already imports `constants.mjs` from `app.mjs`. The transform stores a permuted
UTF-16 payload in `app.mjs` and XOR masks in `constants.mjs`, adding an import
of the mask over **the existing dependency edge**. It creates no third module
and performs the string reconstruction only on the first call to `message()`.
Subsequent calls use the cached decoded string.

The snapshots are [`before/app.mjs`](before/app.mjs),
[`before/constants.mjs`](before/constants.mjs),
[`after/app.mjs`](after/app.mjs), and
[`after/constants.mjs`](after/constants.mjs). The generator keeps Unicode
surrogate code units and embedded zero code units exactly. `render()` still
uses the same `factor` export as before.

After installing Node.js 22 and the repository dependencies on Windows 11:

```powershell
node examples/coo-piggyback/build.cjs --check
node --test test/coo-piggyback-shards.test.js
node sims/coo-piggyback-profile.js
node test/coo-piggyback-browser.js
node_modules\.bin\tsc -p jsconfig.piggyback.json
```

To update the exact snapshots, use `node examples/coo-piggyback/build.cjs --write`.
The build helper writes atomically with a sibling lock file. This is an
explicitly selected experimental transform, not a default COO pass.

## Correctness and security preconditions

The caller must assert a complete closed ESM world. They must exclude imports
of the donor's namespace, enumeration of its exports, source observation of
`message`, outside modules accessing those exports, cyclic early calls, custom
module-loader remapping, changes to the global `String.fromCharCode` builtin,
and arbitrary runtime mutation. The compiler does not prove these external
facts. It refuses unsupported function bodies, a donor with static imports,
missing existing import edges, known direct source observations, or local
`String` shadow bindings. Other forms of implicit source observation remain
outside this syntactic check.

Both files are fully public. The masks, payload, permutation, and decoder
constants can be recovered offline; see the independent seedless source-only
[`recoverString`](../../sims/coo-piggyback-recover.js) attacker. The scheme
provides file-layout obfuscation and reduced extra-module loading, with no
confidentiality, tamper-resistant key, authorization boundary, or anti-debug
security against the stated full-control adversary.

The initial isolated Node measurement met the project 2.5x compute-cost
threshold for **this fixture**. The source-only attacker recovered the whole
string; broader compatibility and browser cold-start remain unproven. Read
[the intermediate study](../../im-results/coo-piggyback-layout-2026-11-15.md)
before considering use.

## Real Chromium integration

`node test/coo-piggyback-browser.js` starts an in-process loopback HTTP
server for each fixture, serves the *actual committed* original and transformed
ESM files, and executes both pages through Chromium `--headless --dump-dom`.
It verifies exact UTF-16 return signatures, identical unrelated `render()`
output, and exactly two fetched `.mjs` resources in either graph. Set
`CHROMIUM_BIN` to the installed Chrome/Chromium executable. The workflow
`.github/workflows/manual-browser.yml` runs this check with Chrome on Ubuntu
when manually dispatched. Node-based tests remain useful if a local Chromium
installation cannot start in the current sandbox.

The compiler also supports a hoisted `message()` invocation during the
consumer's own top-level evaluation, preserving any initial directive
prologue. This behavior is verified in the six-case Node differential suite.
