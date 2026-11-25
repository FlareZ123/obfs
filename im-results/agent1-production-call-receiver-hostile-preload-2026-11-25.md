# Production cross-file property proof: call receiver with hostile preloader

**Status:** focused production regression probe passed; not a full release acceptance.

## Reproduction

- Mainline source pin: `c4bb09f352956e74dd27e664c005a3b1a0dff0ca`
- Independent test branch: `agent1/review-production-call-receiver-rename-20261125`
- Test: `test/agent1-production-call-receiver-hostile-preload.test.js`
- Test commit: `3e667038dba7b9ecd8839d0f10262c67a59d59fe`
- Focused run: [45683747284](https://github.com/FlareZ123/obfs/actions/runs/45683747284)

The test executes a real Node ESM graph after a CJS preloader defines a host callback that installs an own `.call` property on a local function. The module then invokes `read.call(state)`, where `read` reads `this.secretField`. The preloader is deliberately excluded from the obfuscator input. The original output is 59; the transformed graph preserves it and reports `crossFile.properties=0`, refusing the ambiguous receiver property.

A positive control with a direct `state.secretField` read reports `crossFile.properties=1` and preserves output. Thus the production cross-file proof does not globally disable property renaming; it refuses this call-receiver/host-preloader case while retaining a direct proved read.

## Validation

Run 45683747284 succeeded on Ubuntu and Windows. Both jobs passed:
- the focused test;
- Strict project JSDoc;
- Strict external JSDoc for the focused runner;
- Strict JSDoc for paired and complete-suite runtime-budget evaluators.

## Scope

This is a targeted test of the mainline production cross-file property proof, not a full suite, a proof of all possible host mutations, or a security result. It supports the earlier distinction: the false-safe witnesses found in the research-only `workplace/agent9-ambient-call-bindingid.js` helper do not, by themselves, establish a current production regression. No production source file was changed.
