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

## Conditional native-method interception lemma

**Claim (conditional JavaScript operational argument).** Suppose an attacker can
replace the host realm's `Function.prototype.bind` property before an
application evaluates an expression of the form `F.bind(...args)`, where
`F` is a JavaScript function created by that application, and suppose the
application has not captured a separate original bind reference. The
attacker can obtain an actual reference to `F` and preserve the call's
normal returned bound function by installing:

```js
const original=Function.prototype.bind;
const seen=[];
Function.prototype.bind=function(...args){
  seen.push(this);
  return Reflect.apply(original,this,args);
};
```

**Argument.** Ordinary method-call evaluation supplies the receiver `F`
as `this` to the substituted method. Saving `this` reveals that
function object. Forwarding the same receiver and argument list to the
original intrinsic yields the ordinary binding result for that call.
For a user-authored function with source text available to the realm,
`Function.prototype.toString.call(F)` then exposes its current executable
source representation. These consequences follow from call semantics;
the Node and Chromium runs above establish that the assumed receiver and
host-mutability conditions actually occur in the tested builds.

This is an **exact conditional interception**, rather than a theorem about
all JavaScript program behavior. Replacing a builtin changes the ambient
environment; code that checks builtin identity, captures a safe reference
earlier, installs realm protections, or observes intermediate side effects
may behave differently. A fully controlled runtime can still pursue other
instrumentation paths, but this one proof makes no assertion about them.
It also says nothing about inaccessible SCO server-resident functions.

### Identity-based selection without source-text signatures

The matched esbuild/COO comparison now captures **both** the returned bound
function object and its original target function at each intercepted bind:

```js
const bound=Reflect.apply(nativeBind,this,args);
captured.push({bound,target:this});
return bound;
```

After importing the module, the adversary selects the recorded pair by
`pair.bound===app.hot`, an actual function-object identity comparison.
This directly identifies the private target associated with the public
export. It removes the attack's previous test-specific filter requiring
the private function source to contain an arrow token or a bitwise-XOR
operator. Source recovery proceeds through
`Function.prototype.toString.call(pair.target)`. The assumption that
the exported `hot` was bound using the intercepted method remains.

The isolated branch `agent29/bind-return-identity-extraction-20261122`
at `4de8df69f16f57efe65b0500d241d9f8d0ce6a1f`
passed [Ubuntu and Windows focused tests and strict JSDoc in
45001636807](https://github.com/FlareZ123/obfs/actions/runs/45001636807).
That exact test was promoted onto main at
`599e4419e1ed2992f8b4e6013e021d717433fe22`.
This strengthens attribution of the captured function without claiming
knowledge of arbitrary hidden callbacks or other unpublished exports.

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

## SNO one-file CommonJS replication

A separate [SNO test](../test/sno-bound-runtime-interception.test.js)
uses one `entry.cjs` as the only server-executed entrypoint. It compiles
the same primitive private record and nonconstructible bound-arrow target
with `mode:'sno',identifiers:true,properties:true`. A fresh Node 22
subprocess patches `Function.prototype.bind` before the ordinary
`require(entry.cjs)`, records the original bound target, and forwards
the native binding. The test requires **two actual SNO local own-key
renames**, identical native/protected public results and bound public
source, and captured transformed private target source.

The isolated red-first branch
`agent29/sno-bound-runtime-interception-20261122`, exact
`523c645c00bae4130a4aba0d14669462b290f198`, passed on Ubuntu
and Windows in [focused run 45000039077](https://github.com/FlareZ123/obfs/actions/runs/45000039077).
The exact test was then carried unchanged to main in commit
`e38df5457ec389237e2f909bc281a0b3121723d1` and added to the
strict external JSDoc project in `0110e5439617d8408d4e1f526b96958167766dff`.
The latter source passed its real focused SNO subprocess and both
JSDoc checkers on Ubuntu and Windows in
[run 45000147223](https://github.com/FlareZ123/obfs/actions/runs/45000147223).

This directly covers the prompt's SNO assumption that the attacker
controls the Node runtime and memory. Its ability to patch a builtin
before requiring the sole entry is more restrictive than that threat
model, and thus a valid counterexample to the claim that the bound
private target resists SNO dynamic extraction. The example does not
claim general static reconstruction of all SNO data and code.

## Browser replication

[`test/bound-runtime-interception-browser.js`](../test/bound-runtime-interception-browser.js)
serves an original and a protected ESM graph on localhost. Each HTTP
document loads an external `bootstrap.mjs` with
`Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'`.
The bootstrap installs the same bind interception before dynamically
importing `entry.mjs`. It reports actual Chromium results using an HTML
data element, without bypassing CSP, changing the emitted program, or using
DevTools/CDP extraction. The [real Chromium workflow 44999347098](https://github.com/FlareZ123/obfs/actions/runs/44999347098)
completed successfully at exact SHA `f6d03db4bdd39f5ef27e9c443d7f2baddf6864bd`.
The dedicated step passed and emitted
`BOUND_RUNTIME_BROWSER_INTERCEPTION {"browser":"Chromium","protectedKeys":2,"capturedFunctions":1}`.
This is an actual Chromium ESM/import/CSP execution result, rather than a
Node-only proxy. The later strict-JSDoc inclusion of this browser file
was made in a separate commit and is validated independently.

The browser workflow's dependency installation was subsequently made
lockfile-deterministic with `npm ci --ignore-scripts --no-audit --no-fund`;
identical-source duplicate Chromium jobs now cancel by exact SHA
(commit `fb1dd4ada18742926986ea4b49bcdcaec85c74e0`).
[Full real Chromium workflow 44999867614](https://github.com/FlareZ123/obfs/actions/runs/44999867614)
at that exact source completed green: install, hostile bind interception,
full browser suite, and JSDoc checks passed. Duplicate cancellation itself
was not stress-tested and is only a configured scheduling policy.

## Equal-trust esbuild-minified source-extraction control

The [matched minifier-control test](../test/bound-runtime-minifier-control.test.js)
applies esbuild's documented single-module
[`transformSync` minification](https://esbuild.github.io/api/#transform)
to the **same 200-byte input** as the obfuscator, using
`loader:'js',format:'esm',minify:true,target:'es2022'`. A fresh
instrumented Node 22 ESM subprocess loads four variants:
original **200 bytes**, plain esbuild-minified **113 bytes**, esbuild with
explicit **two-property mangling, 75 bytes**, and obfuscated **216 bytes**.
The property-mangled control uses the reviewed closed-world
`mangleProps:/^(secretField|otherField)$/` pattern so both esbuild and the
obfuscator transform the same two private own keys. One host-patched native
`Function.prototype.bind` is installed in each same-trust process
**before** module import; it records the actual private target function.
All three protected/minified variants preserve the native numeric output
and public bound `Function#toString`.

The attack recovers exactly **one private arithmetic target** from
each plain minified, property-mangled and obfuscated output through the
same interception point. The plain-minified function source still
contains `secretField`; the property-mangled source removes both
original field spellings, while the obfuscated source contains the actual
rewritten `_p...` property spelling. Both the property-mangled control
and the obfuscated build alter **the same two own keys**. This directly demonstrates **no additional barrier
to this particular pre-import bind interception** over an ordinary
minifier, at the tested input and instrumentation point. It does not
compare algorithm-reconstruction effort after the extracted source is
read, generalize to arbitrary workloads, or measure runtime overhead.

The independent branch
`agent29/bound-runtime-minifier-control-20261122` at exact
`97278e4e669090453519bcf2cc05ea449471dd99`
passed on both Node 22 platforms in
[run 45000608446](https://github.com/FlareZ123/obfs/actions/runs/45000608446).
Both platform logs reported:
`{"originalBytes":200,"minifiedBytes":113,"protectedBytes":216,"attackerInterceptionMethod":"Function.prototype.bind","capturedTargetsPerBuild":1}`.
The test was promoted unchanged to main in `6af9bdd06a4b3f25d7f3489ff6e098ce550d7f7e`
and enrolled in strict external JSDoc by `3b93c0ec697205e9cbf2bed6dfa2bc7b4adef3c3`.
The main source-pin [45000680653](https://github.com/FlareZ123/obfs/actions/runs/45000680653)
at that exact `3b93c0ec697205e9cbf2bed6dfa2bc7b4adef3c3`
also completed **green on Ubuntu and Windows**, with the real matched
minifier attack test, project JSDoc, and strict external JSDoc all passing.

### Property-mangled equal-key negative control

The first additional branch source `522eacd0a4c5fc4a98c8d010c2ff973182fd409c`
failed [run 45000922469](https://github.com/FlareZ123/obfs/actions/runs/45000922469)
because esbuild delegates its property regex compilation to Go:
the JavaScript `/u` flag was rendered as unsupported `(?u)` in the
pattern. Removing the unnecessary Unicode flag produced the reviewed
exact source `aa5b89901c3e81445f09a95e1cbec881f09afc53`,
[Ubuntu and Windows green 45000997264](https://github.com/FlareZ123/obfs/actions/runs/45000997264).

That source logged the identical four-arm observations on both OS:
`{"originalBytes":200,"minifiedBytes":113,"mangledBytes":75,"protectedBytes":216,"attackerInterceptionMethod":"Function.prototype.bind","capturedTargetsPerBuild":1}`.
The main comparator was updated at
`fd81a4fc71582c180400345cc774e21b9a5f807c` and
[Ubuntu/Windows strict typechecks and focused execution were green in run
45001089964](https://github.com/FlareZ123/obfs/actions/runs/45001089964).
This stronger control rules out plaintext property names as the reason
the same host-interception operation succeeded: **both** equal-key
published variants hid those names before the private target was
captured. It remains a scoped, single-operation finding with
precommitted field-name selection for the esbuild control. It is not
a matched test of arbitrary-program automatic property discovery or
post-capture reverse-engineering effort.

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
