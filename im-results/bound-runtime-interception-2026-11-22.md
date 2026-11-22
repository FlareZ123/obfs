# Runtime interception of a bound private function under a hostile JavaScript host

**Status:** Intermediate source-extraction attack, 22 November 2026. The observation is adversarial **dynamic extraction**, independent of the static function-source compatibility counterexample in [bound-export-source-reachability](bound-export-source-reachability-2026-11-22.md). It does not establish an optimal attacker model, complete reconstruction, or a general runtime slowdown bound.

## Experiment

The compiler receives one self-contained ESM module:

```js
const owner={secretField:7,otherField:11};
const internal=(privateFirst,privateSecond)=>{
  return ((privateFirst+owner.secretField)^owner.otherField)+privateSecond;
};
export const hot=internal.bind(null);
```

The COO build is requested with `closedWorld:true`, `properties:true`, `identifiers:true`, `strings:false` and a frozen seed. The build rewrites **two** private record fields and removes their plaintext spellings from the emitted source. The exported bound arrow is **not constructible**, avoiding the separate prototype-constructor source observation described in the linked report.

An attacker controlling the module's JavaScript host can run the following instrument *before importing the protected module*:

```js
const captured=[];
const original=Function.prototype.bind;
Function.prototype.bind=function(...args){
  captured.push(this);
  return Reflect.apply(original,this,args);
};
const app=await import('./entry.mjs');
Function.prototype.bind=original;
const extracted=captured.map(fn=>Function.prototype.toString.call(fn));
```

The original function object is passed to `Function.prototype.bind` as `this`. The wrapper records that object and forwards the legitimate bind call. The attacker does not need to alter the obfuscated module source or induce an exceptional result from its public API. The emitted private target's source becomes available from the captured function object at runtime. The original and protected `hot(4,6)` results still agree.

This threat is explicitly in the prompt's COO/SNO full-control environment models: attackers can instrument or replace native intrinsics before code runs. In SCO, server-side isolated private code would not pass its private target function through the client runtime's `bind`, so this particular client-side interception cannot disclose such server-only source; the public client stub remains observable.

## Reproduction and pinned Node evidence

[`test/bound-runtime-interception.test.js`](../test/bound-runtime-interception.test.js)
writes original and compiled modules through locked atomic writes in a temporary directory, invokes each in a fresh Node 22 ESM subprocess, and installs the instrumentation before the dynamic import. It demands two actual rewritten own keys and checks:

- Native and emitted public return values agree.
- The instrument captures the native function body containing `owner.secretField`.
- The instrument captures the transformed function body containing a ten-hexadecimal `owner._p...` key.
- That transformed body no longer contains the unprotected `secretField` spelling.

The first probe at source `7ae81101843180127eef17142aad78a34549220c`,
[workflow 44999107471](https://github.com/FlareZ123/obfs/actions/runs/44999107471), failed **before executing any test logic** because an unrelated concurrent edit had inserted a second
`const {collectBindings}=require('./properties')` declaration in
`src/sco-selective-partition.js`. The isolated duplicate-import parse
regression was removed in commit `3cf66723001e868d65766fab341cbf44da60cd3a`.
This prior failure is **not evidence against** the interception hypothesis.

At exact source `3cf66723001e868d65766fab341cbf44da60cd3a`,
[workflow 44999175396](https://github.com/FlareZ123/obfs/actions/runs/44999175396)
completed **green on both Ubuntu and Windows**, including strict project and
external JSDoc type checks and the real Node subprocess attack.

## Browser replication

[`test/bound-runtime-interception-browser.js`](../test/bound-runtime-interception-browser.js)
serves an original and a protected ESM graph on localhost. Each HTTP
document loads an external `bootstrap.mjs` with
`Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'`.
The bootstrap installs the same bind interception before dynamically
importing `entry.mjs`. It reports actual Chromium results using an HTML
data element, without bypassing CSP, changing the emitted program, or using
DevTools/CDP extraction. The browser-specific observation should be promoted
to confirmed only after source-pinned Chromium workflow completion.

## Limits and implications

The result demonstrates an authorized-function object escaping through a
host-patchable builtin. Any client JavaScript protection whose security
argument presumes an unmodified `Function.prototype.bind` is incompatible
with the stated full-control browser attacker. The same broad concern
applies to other externally instrumentable operations and host callbacks,
but this single witness proves only its exact bind path.

Attack presence does not imply that all private code in all three modes
can be recovered through this one method. It does show why source-stable
public wrappers and nonconstructible bound arrows, while helpful for
**ordinary application semantic compatibility**, cannot by themselves
constitute an anti-extraction guarantee. The strongest mode-specific
security candidate still requires an explicit trust boundary, independent
instrumentation studies, and separate whole-workload performance testing.
