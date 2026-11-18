# Reflected WindowProxy constructor: a closed-world property-renaming negative result

**Agent 20, 18 November 2026.** Intermediate, test-bounded evidence.
This experiment does not establish a new obfuscation security advantage.

## Question

Can an unrecognized browser `top` reference hide a second ESM consumer
from cross-file property renaming by obtaining the native `Function`
constructor through `Object.getOwnPropertyDescriptors(top)` and
`Object.values`, dynamically importing the same source, and inspecting
the original exported object keys?

This would matter if the compiler rewrote the direct static ESM access
to a private key but left a source-visible runtime consumer capable of
observing the original field spelling.

## Executed differential

`test/windowproxy-reflected-function-loader.test.js` supplies a
host-level Node 22 preload that creates `top=globalThis` *outside*
the files given to the compiler. This approximates the already-present
top-level browser WindowProxy and prevents a visible JS shim from
trivially disabling transformation. The native ESM graph exports
`record={secretField:13}`; the entry module statically imports it.

The unsafe entry obtains the descriptor values of `top`, finds the
native constructor by its function name, and invokes that constructor
with `return import(u)`, where `u` is the absolute file URL of the
owner module. The imported namespace's `Object.keys(record)` must
remain `["secretField"]` and the direct value must remain 13.
The compiler is explicitly required to refuse all cross-file
property renames for this untracked consumer.

A **separate positive control** statically imports the same owner
and performs `record.secretField+globalThis.Math.max(1,2)`,
requiring at least one *actual* cross-file property rename while
preserving the original 15 output. This control detects vacuous
always-off implementations.

## Result and limits

The earliest draft's positive control failed to rename any property
because the source graph included additional confounding operations;
that [run 44289171583](https://github.com/FlareZ123/obfs/actions/runs/44289171583)
established no unsafe compiler transformation. The witness was revised
to move the global alias into the child host preload and to match a
proven static consumer's syntax.

The corrected 
[run 44289856763](https://github.com/FlareZ123/obfs/actions/runs/44289856763)
at source `ed5d040d0b4116b018320dcaf4d612b9a67da086`
passed on both Ubuntu and Windows. Its assertions establish the
combination of: **a positive transformed property count**, **zero
unsafe cross-file renames**, and native/generated output parity
under a genuine dynamic ESM import. This rules out the specific
proposed bypass on the tested compiler and source shape.

This is a successful conservative refusal. It does not prove that
every reflected or interprocedural runtime loader is tracked. It is
a Node host-preload analogue rather than an independently executed
real-browser test, and it does not measure static reconstruction,
dynamic extraction, tamper resistance, or the 2.5x runtime ceiling.
No compiler code change is warranted by this negative result.
