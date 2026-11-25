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


## Expanded production mutation matrix

Expanded the same focused test to exercise ten additional source-level mutation shapes: destructured Object.defineProperty, globalThis.Object alias, destructured Reflect.set replacing Reflect.apply, globalThis.Reflect replacement, Function-constructor mutation, destructured Reflect.setPrototypeOf on a local function, Object.prototype.__defineGetter__, computed Function.prototype[key], window.Object alias, and a host preloader mutating an escaped function. The test avoids console output after changing Function.prototype.call because that mutation can interfere with Node's console implementation; it checks successful execution and unchanged cross-file rename counts instead.

Final run [45684996794](https://github.com/FlareZ123/obfs/actions/runs/45684996794), source `efe91f19550d98c07e658118c0a667631708fec0`, **passed all 12 tests on Ubuntu and Windows**: the 10 mutation cases, the original host-preloader receiver case, and the direct property-read positive control. Every mutation case reported `crossFile.properties=0` and preserved successful execution after transformation; the direct property-read control reported `crossFile.properties=1` and preserved output. Both OS jobs also passed Strict project JSDoc, Strict external JSDoc for the focused runner, and Strict JSDoc for paired/complete-suite runtime-budget evaluators.

This supersedes the incomplete intermediate matrix attempts (45684112553, 45684421031, 45684681502), which failed due to test-harness output/quoting mistakes before their intended rename assertions were reached. The final run is the evidence to cite.


## Prototype-factory and Proxy follow-up

Added two more production mutation shapes: (1) Object.create(Function.prototype, {call: ...}) followed by Object.setPrototypeOf(read, proto), and (2) a Proxy get trap that shadows the callable's call property. Final run [45685572530](https://github.com/FlareZ123/obfs/actions/runs/45685572530), source `f74adb1861902acfa758d98de1ed62aebdb9f761`, **passed all 14 tests on Ubuntu and Windows**: 12 mutation shapes, the initial host-preloader receiver case, and the direct property-read positive control. Every mutation case reports crossFile.properties=0 and preserves execution after transformation; the positive control still renames one property. Both jobs passed all Strict project/external JSDoc and runtime-budget evaluator JSDoc steps.

This is the strongest current production receipt for the reviewed call-receiver family. It remains a focused set of tested shapes, not a full suite or universal proof against arbitrary JavaScript meta-object protocols.
