# Host-lock wrapper versus observable Error stack coordinates

**Agent 8, 18 November 2026. Status: intermediate semantic-correctness evidence.**

## Finding

The browser host-lock wrapper is executable source inserted before the supplied
program. V8/Chromium stack strings contain source line and column coordinates,
so a single-file program can observe the wrapper indirectly through
`Error.stack` even when every ordinary AST rewrite is disabled.

This was a real gap in `src/core.js`. Multi-file publication already folded
`observesFunctionSource(...)` into the whole-group source-observer refusal,
but a single-file host lock only consulted `observesDistributedSource(...)`.
The local property, identifier and string passes separately declined stack
observers; the later host-lock injection had no corresponding local guard.

This is compatibility evidence only. It establishes no confidentiality,
tamper-resistance, authorization-strength or anti-reconstruction result.

## Frozen pre-repair Node differential

The counterexample branch
`agent8/host-lock-stack-red-20261118` at
`2983c9770fe6867963dd13246e6c41ea8388aa08` compiled this classic-script
shape in both COO and SCO with only `allowedHosts` enabled:

```js
try { null.value; }
catch (error) { globalThis.result=error.stack; }
```

The native and emitted programs were evaluated in fresh Node VM contexts with
the same fixed filename `entry.js` and an authorized hostname. Manual run
[44380739645](https://github.com/FlareZ123/obfs/actions/runs/44380739645)
passed its counterfactual assertions on Ubuntu and Windows Node 22.23.4:

```text
COO native:       at entry.js:1:12
COO generated:    at entry.js:3:12
SCO native:       at entry.js:1:12
SCO generated:    at entry.js:3:12
```

The operation and thrown TypeError were otherwise the same. The observable
stack frame was not.

The same script also contains a non-observing positive control. It requires a
real generated host guard, evaluates to `42` under the authorized hostname,
and throws `Unauthorized execution host` under a denied hostname. Thus the
red witness cannot pass by disabling host locking globally.

## Frozen real-Chromium counterexample

The same pre-repair core was retained and a separate browser harness was added
at branch head
`8bcc23dc7e0ff5d3e331bc8f21da437cd3cbf0bc`. Manual run
[44381626300](https://github.com/FlareZ123/obfs/actions/runs/44381626300)
executed actual headless Chrome on Ubuntu and observed:

```text
native:       http://127.0.0.1:<port>/native:2:12
generated:    http://127.0.0.1:<port>/generated:4:12
```

The harness compares the extracted line/column pair rather than the differing
fixture URL. Native was `2:12`; pre-repair generated was `4:12`.
The authorized safe host-lock page also executed successfully.

## Repair

Commit `6b31993968a06af1ebda4e891dabc549d2e3162f` adds a
single-file `hostLockSourceObserver` admission check before any output is
published. When `allowedHosts` is requested, the original AST is checked
with the same broad `observesFunctionSource` proof already used to protect
multi-file source observation. A stack/source observer now causes the existing
fail-closed error:

```text
Host locking cannot preserve observable source bytes
```

The later wrapper cannot silently shift an observed coordinate.

Durable artifacts are:

- `sims/host-lock-stack-source-attack.js`, with pre-repair and guarded modes
  plus the authorized/denied positive control;
- `test/host-lock-stack-source.test.js`, executed by the root Node suite;
- `sims/host-lock-stack-chromium.js`, with the frozen browser differential
  and guarded positive mode;
- the existing manual source-proof workflow, extended rather than creating a
  new per-commit workflow.

The repaired code and Node regression passed the complete Ubuntu/Windows
`manual-validation.yml` in
[44381163679](https://github.com/FlareZ123/obfs/actions/runs/44381163679)
at exact head
`3036f90046d79ec3b27029e3f0373ba5ad765c5f`.
After the browser harness itself was committed, focused run
[44381811223](https://github.com/FlareZ123/obfs/actions/runs/44381811223)
passed on exact head
`052239b0658b50d33f9a5988635717541ccf0dc5`, including Ubuntu Chromium,
both Node platforms and strict JSDoc.

## Precision and remaining limits

The new host-lock admission uses the repository's broad
`observesFunctionSource` predicate. That predicate intentionally combines
exact function-source observers, function-name observers and coordinate
observers. Therefore a single-file host lock can now be rejected in some
cases where the wrapper would leave a particular function's
`Function.prototype.toString()` text unchanged. This is a conservative
semantic-safety choice and a **yield cost**, not evidence of stronger
obfuscation. A future precision recovery would need an independently tested
coordinate-only proof before weakening this refusal.

The guard is still syntactic. Opaque external consumers can inspect an Error
or function after it escapes even when no supplied AST contains the observer;
that broader contract limitation is already documented elsewhere in the
repository. SNO remains outside this host-lock path because browser hostname
locking is rejected for SNO before this analysis.

The result changes no release verdict. It prevents one demonstrated
single-file COO/SCO semantic mismatch while retaining a live host-lock
positive control.
