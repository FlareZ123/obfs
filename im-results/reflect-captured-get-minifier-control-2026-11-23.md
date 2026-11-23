# Captured `Reflect.get` host-caller observer: matched ordinary-minifier control

**23 November 2026. Classification: reproducible intermediate compatibility
counterexample and equal-trust control. Not a release-grade protection result.**

## Claim and provenance

The previous [external-host source-observer report](captured-reflect-get-host-caller-source-2026-11-23.md)
showed that a native-looking `const get=Reflect.get` on a freshly owned
primitive literal can produce a changed public result after selected string
encoding when the **runtime host** replaces `Reflect.get` before the target
CommonJS module loads. That source-free-from-the-compiler preloader can inspect
its sloppy caller through the legacy `arguments.callee.caller` accessor.

This follow-up controls for whether the observation uniquely implicates this
obfuscator. The [exact isolated source commit
`c6e5c6e65285b79ced09315fe5c5aa1c547de117`](https://github.com/FlareZ123/obfs/commit/c6e5c6e65285b79ced09315fe5c5aa1c547de117)
contains [the one-file experiment](https://github.com/FlareZ123/obfs/blob/c6e5c6e65285b79ced09315fe5c5aa1c547de117/test/reflect-host-minifier-parity-control.test.js).
The [focused two-OS GitHub Actions receipt 45129792894](https://github.com/FlareZ123/obfs/actions/runs/45129792894)
passed on both Ubuntu and Windows with Node **22.23.4**. Its full Node-suite
job was intentionally skipped by the focused workflow; strict project,
external and paired-budget JSDoc checks were included in the focused jobs.

## Reproduction boundary

The shared input is a CommonJS source file with a captured
`const get=Reflect.get`, an actual `get({known:2},'known')` call, and literals
eligible for encoding. Each arm runs as a real, separate Node CommonJS
`require()` in a fresh temporary directory and child process. A `--require`
preloader either does nothing or supplies a non-strict custom `Reflect.get`:
for the selected own-primitive lookup it returns its caller function's
`toString()`, otherwise it delegates to the original native intrinsic.

The arms are (1) the unmodified input, (2) ordinary
`esbuild.transformSync` using `minify:true` and `target:'node22'`, and
(3) `obfuscateFiles` outputs in COO, SNO, and SCO modes with
`strings:true`, `identifiers:false` and `properties:false`.
Every obfuscator arm is required by assertion to have **positive actual
string-encoding yield**. The minified arm is required to be shorter than
its source; both are compared against the same original and runtime host.

## Observed finite outcomes

| Comparison | Native `Reflect.get` | External preloader |
|---|---|---|
| Original vs ordinary esbuild | JSON outputs equal | JSON outputs differ |
| Original vs obfuscator COO | JSON outputs equal, encoding yield >0 | JSON outputs differ |
| Original vs obfuscator SNO | JSON outputs equal, encoding yield >0 | JSON outputs differ |
| Original vs obfuscator SCO | JSON outputs equal, encoding yield >0 | JSON outputs differ |

All four tests passed on **each** runner. The intentional inequality
assertions succeed because the host reads the rewritten CommonJS wrapper
source, which differs from the input source. This is source-observing
behavior independent of application return-value equivalence under a native
unmodified intrinsic. The previous isolated red witness uses equality
assertions for exactly the hostile-host case and documents three mismatches
per OS. Here both minifier and compiler are tested using explicit
expected-divergence assertions.

## Interpretation and decision

The experiment falsifies a claim that this narrow observed host-dependent
parity problem is unique to the obfuscator: an ordinary equal-trust minifier
exhibits the same kind of external-caller source distinction. It does **not**
prove that every source transformer fails, that esbuild and this obfuscator
have exactly equal risks, or that untouched ESM and modern strict functions
expose the same legacy `caller` access.

The compiler's captured-native method proof remains conditional on the
**runtime intrinsic provenance assumption**. Closed input files alone
cannot prove this externally provided method remains native. Keep the
pristine-host semantic positive control and nonzero transformation
coverage when evaluating any proposed conservative refusal or proof change.
Do not promote this compatibility result into source confidentiality,
tamper resistance, anti-instrumentation advantage, environment locking or
2.5×-compute compliance. The repository's primary release remains blocked.
