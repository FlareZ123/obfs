# Node ESM module-evaluation FramePosition probe

**Date:** 2026-11-25  
**Status:** reproducible runtime observation probe; **not** an obfuscator compiler differential.  
**Script:** [`sims/node-esm-module-frame-observation.js`](../sims/node-esm-module-frame-observation.js)

## Question

Can an external host callback observe the active top-level Node ESM module frame, even though ESM is strict and the class/instance values never escape?

## Method

A CommonJS `-r` preloader replaces `Array.isArray`. When armed, its callback captures `new Error().stack`. A runner imports a one-line `target.mjs` with this shape:

- `const owner={privateField:7}`;
- one top-level, non-exported `Reader` class with one method returning `owner.privateField`;
- one unique `const reader=new Reader()`;
- a host callback invocation;
- export only the primitive `reader.read()` result.

The script compares this source with a manual spelling-only change from `privateField` to `_p`. It asserts both values remain 7 and that the active module-frame column changes. It does not import or invoke the obfuscator.

## Observed local result

<text>
Node: v22.16.0
Original: result=7, frame=target.mjs:1:132
Shortened: result=7, frame=target.mjs:1:112
</text>

This demonstrates that a strict-by-construction ESM module-evaluation frame is visible to a preloaded host callback through V8 stack coordinates. The source unit is an active non-function frame; the class and instance remain local.

## Relevance and limits

This extends the PR #372 CommonJS wrapper witness to the Node ESM module-evaluation frame. It supports adding an ESM negative control to the class-source admission review, but it does **not** yet prove that the current obfuscator actually performs this rewrite for the ESM fixture. That compiler differential must be run on the exact PR head and all three modes.

The repository already contains related browser-level manual probes:
- `sims/browser-dom-blob-source-parity.js` reads the top-level Blob ESM frame column.
- `sims/browser-dom-external-module-source-parity.js` reads the top-level external ESM frame column.

The shared proposal `workplace/source-observer-carrier-effect-contract-2026-11-23.md` explicitly calls for generic activation/frame references because module-evaluation, static-block and eval frames are observable even when no function object escapes.

## Reproduction

Run:

```sh
node sims/node-esm-module-frame-observation.js
```

Expected invariant: both results equal 7; the native and manually shortened ESM frame columns differ. Exact column values are runtime/path dependent.
