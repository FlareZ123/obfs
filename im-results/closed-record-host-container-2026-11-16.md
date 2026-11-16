# Opaque host capability containment in closed-world ESM records (2026-11-16)

**Agent:** Agent 21. **Status:** reproducible negative and bounded compiler-refusal improvement. These observations establish no confidentiality, tamper resistance, or universal performance guarantee.

## Question

The private-record computed-key proof was hardened against simple aliases of host-provided callables. Can an ESM file put such a callable into a plain local object or array, read it back, and dynamically import another module without causing the property-ownership proof to decline?

## Reproducer

The two variants extend the actual fresh-process Node ESM loader fixture in test/cross-file-safe-record-read.test.js. A host preloader executed through Node --require sets globalThis.RUNTIME_FACTORY=Function. The static input group has state.mjs exporting a record with secretField:41; record.mjs exports inspectRecord(key), which returns an immutable plain record containing Reflect.ownKeys(schema), schema[key] and a native descriptor check. entry.mjs calls inspectRecord('auditCount'), an existing own key, and obtains the host loader through one of:

~~~js
const holder={ctor:globalThis.RUNTIME_FACTORY};
const ctor=holder.ctor;
// or
const holder=[globalThis.RUNTIME_FACTORY];
const ctor=holder[0];

const remote=await ctor("return import('./state.mjs')")();
const result=[inspectRecord('auditCount').value,Object.keys(remote.state),remote.state.secretField];
console.log(JSON.stringify([state.secretField,result]));
~~~

The Node original prints [41,[3,["secretField"],41]]. There is no static import edge to the module accessed inside the host-provided Function constructor.

## Pinned observations

| Version | Linux/Windows outcome | Exact output of transformed program |
| --- | --- | --- |
| [Pre-fix 43845946573](https://github.com/FlareZ123/obfs/actions/runs/43845946573), SHA 4d52a2606a77e5d7302da3ef2ab5967f3e4fc3a1 | Both regressions fail on both OSes | Object variant [41,[3,["_p5b1a2d7bb213"],null]]; array variant [41,[3,["_p291ca4749c3e"],null]] |
| [Revised 43846207907](https://github.com/FlareZ123/obfs/actions/runs/43846207907), SHA 45e30232678571bc1b5de42eb2c69742fbcf83c5 | Linux, Windows and legacy Node 22 all green | Both emitted programs now match their own original and decline the unsafe private-field rename |

The bounded repair in src/cross-properties.js adds a hostContainers set inside safeClosedCallerRecordRead. It recognizes local object/array literals containing direct host-member values, propagates simple identifier aliases, and classifies subsequent member reads and invocations from those containers as potentially opaque host capabilities. A native loader may then observe another ESM owner's original key spelling. The compiler therefore declines the unrelated property rename. Existing positive own-key app tests and intentionally refusing frozen tests remained green in the targeted gate.

## Why this is still intermediate

The implementation is a deliberately small syntactic proof guard. It does not track arbitrary object/array mutation, function returns, proxy behavior, host injection through unrelated APIs, or dynamic aliasing across arbitrary modules. A true interprocedural ownership proof is still needed for the project's complete property-renaming objective; careless global refusal eliminates much of the positive work. All COO outputs remain copyable and instrumentation-accessible under the project's full-client threat model.

Performance: the observed difference is compiler admission, not an added runtime interpreter. The targeted run includes sample process-level performance checks, but neither it nor this report proves 2.5x for every program.

**Reproduce:** node --test test/cross-file-safe-record-read.test.js and the repository manual-application-challenge.yml at the pinned source revision.
