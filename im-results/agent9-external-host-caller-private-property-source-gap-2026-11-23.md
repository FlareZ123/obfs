# Agent 9: external host-caller observation defeats private property source proof

**Date:** 2026-11-23  
**Classification:** Reproducible contextual source-parity failure.  
**Production status:** No production code changed. The witness lives on an isolated research branch.

## Source-pinned experiment

- Branch: agent9-external-host-caller-property-source-witness-20261123
- Commit: bf637b047e1d86dec658851d405cbe84365f5d6b
- Test: test/agent9-private-property-external-caller-source-witness.test.js
- Workflow: manual-validation.yml, focused_test=test/agent9-private-property-external-caller-source-witness.test.js
- Run: [45289188566](https://github.com/FlareZ123/obfs/actions/runs/45289188566)
- Runtime: Node 22.23.4
- Result: all three mode cases (COO, SNO, SCO) fail on both Ubuntu and Windows at the native function-source equality assertion. Install and test dispatch succeed; this is not an environment or workflow failure.

## Minimal witness

The input program contains a directly called helper and a local object owner:

    function hidden(){
      const owner={secretField:41,otherField:2};
      getExternal();
      return owner.secretField+owner.otherField;
    }
    function publicReader(){return hidden();}
    module.exports=publicReader;

The input source contains no Function#toString, caller, arguments.callee, Error.stack, or other explicit source-reader expression. getExternal is a free host callback injected by the test harness.

The host callback is created outside the compiled source graph as a sloppy function. It captures its caller with arguments.callee.caller; after publicReader returns, the harness reads Function.prototype.toString from that captured function object.

The native hidden source observed by the callback is:

    function hidden(){const owner={secretField:41,otherField:2};getExternal();return owner.secretField+owner.otherField;}

The emitted hidden source observed by the same callback is:

    function hidden(){const owner={"_p2928ab9876":41,"_p2f075957cd":2};getExternal();return owner._p2928ab9876+owner._p2f075957cd;}

The test checks the runtime value first; it remains 43. The subsequent exact source comparison fails. The output has renamed both local owner fields and their member reads.

## Why the proof admits the rewrite

In PR #357's src/properties.js, privateFunctionNodes classifies functions by their in-file binding uses. A helper whose binding is used only as a direct call can be admitted as private. The sourceVisibleAncestor check then permits property rewriting inside that helper.

The external callback does not create another lexical reference to hidden, nor does its source appear in the compiled AST. The direct-call-only reference inventory therefore misses the observer. The helper remains classified as private even though an external callback invoked while it is active can recover its caller function and native source.

The branch's existing test/property-sloppy-caller-source-observer.test.js covers caller/callee syntax written inside the input program. That syntax is visible to observesFunctionSource and is refused. This new witness places the caller inspection wholly inside the external callback, so the in-file scanner cannot see it.

Agent 38's im-results/local-source-callable-identifier-refusal-2026-11-23.md contains a related caller/stack witness for identifier rewriting. This experiment demonstrates the corresponding property-rewrite failure directly.

## Consequence and required boundary

A direct-call-only AST use proof is not a sound universal proof that a function's source is unobservable when arbitrary synchronous host callbacks are in scope. A host callback can inspect the active caller through legacy sloppy caller accessors; V8 stack callbacks provide another route.

The source-observation model must represent this as a separate ambient host-caller/stack capability, distinct from explicit source-reader syntax and DOM/Web-IDL conversion sinks. Possible safe boundaries are:

- conservatively treat unknown synchronous external calls from a candidate private helper as possible caller/stack observers;
- use a reviewed host capability contract that identifies which external calls cannot inspect or expose the active frame;
- or explicitly narrow the semantics contract to exclude legacy caller and V8 CallSite reflection, with tests documenting that exclusion.

Do not use privateFunctionNodes as a universal non-escape proof under an unrestricted host-callback model. This witness is a semantic source-parity failure, not a claim that arbitrary DevTools instrumentation can be prevented.
