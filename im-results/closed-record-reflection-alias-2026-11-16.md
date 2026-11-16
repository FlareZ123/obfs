# Closed-record reflection aliases: two real ESM semantic counterexamples (16 November 2026)

**Author:** Agent 21. **Status:** intermediate, exact-SHA reproducible compiler-safety repair. This does not establish distributed-source confidentiality, hostile-runtime integrity, or a general 2.5x performance guarantee.

## Threat and compiler assumption

The source-only, closed-world ESM property renamer permits a narrow computed reader of an immutable private record when all direct named callers pass declared own-string keys. The proof allows native reflection reads while prohibiting direct assignments or deletion of the reflection methods. A source program can nevertheless mutate those globally shared methods through aliases or computed global lookups. The resulting loader can dynamically import a protected ESM module and inspect distributed field names.

This differs from the previously documented attack performed by code outside the declared graph in test/closed-record-host-hook-attack.test.js. Here the mutation itself appears in an input source file; the external Node --require preload supplies only a Function value.

## Exact fixture patterns

The new tests in test/cross-file-safe-record-read.test.js comprise three ESM files. Their essential source structure is:

~~~js
// state.mjs
export const state={secretField:41};

// record.mjs
const schema={externalFormat:'audit-v1',auditCount:3};
const reflection=Reflect;
// Variant 2 substitutes:
// const intrinsic='Reflect';const reflection=globalThis[intrinsic];
reflection.ownKeys=()=>[globalThis.RUNTIME_FACTORY];
export function inspectRecord(key) {
  return {
    keys:Reflect.ownKeys(schema).sort(),
    value:schema[key],
    enumerable:Object.getOwnPropertyDescriptor(schema,'externalFormat')?.enumerable===true
  };
}

// entry.mjs
import {state} from './state.mjs';
import {inspectRecord} from './record.mjs';
const ctor=inspectRecord('auditCount').keys[0];
const remote=await ctor("return import('./state.mjs')")();
const result=[Object.keys(remote.state),remote.state.secretField];
console.log(JSON.stringify([state.secretField,result]));
~~~

An actual Node 22 preloader sets globalThis.RUNTIME_FACTORY=Function. The caller uses the declared own key auditCount, so the prior inherited-key veto does not apply. The modified reflection method supplies a runtime loader, which imports the original state ESM module under an untracked path and observes the owner's emitted property names.

## Pinned red and green evidence

| Run | Source SHA | Linux/Windows | Evidence |
| --- | --- | --- | --- |
| [43840041396](https://github.com/FlareZ123/obfs/actions/runs/43840041396) | f463beb24e74fcc3a0e3f1349707a0ed71ea7a3d | red/red | Direct alias: native [41,[["secretField"],41]], transformed [41,[["_pc2deac8c0a36"],null]]. |
| [43840254536](https://github.com/FlareZ123/obfs/actions/runs/43840254536) | 5b3bf37c9a9ff465d74d8cf6f1f9d770878edd54 | green/green | First guard declines direct alias while preserving original positive own-key fixture. |
| [43840635107](https://github.com/FlareZ123/obfs/actions/runs/43840635107) | 794b7d502e45791928e3d4a6c91ac7a3a690fc70 | red/red | Computed global Reflect alias: native [41,[["secretField"],41]], transformed [41,[["_pbc693f5494ea"],null]]. |
| [43840963528](https://github.com/FlareZ123/obfs/actions/runs/43840963528) | 1706b957a429ffb27cc05d1302ccae36a24b0994 | green/green | Both aliases refuse unsafe field renames. Existing positive own-key test and frozen application diagnostics passed; legacy Node 22 lane green. |

The repair is in src/cross-properties.js inside safeClosedCallerRecordRead. It rejects references to Object/Reflect that may escape native direct-method use, accessing them as object properties, and computed nonliteral lookups through recognized global identifiers. These are compiler refusal conditions, not emitted runtime checks. Both test variants change from one unsound private-field rename to zero; unrelated existing positive controls retain their transformations.

## Limitations and follow-up

- A host outside the declared source graph can still replace ambient reflection functions. The successful outside-host-hook attacker already documents this gap.
- The syntactic checks cannot establish native reflection in an adversarial execution realm or resolve every possible global alias, dynamic property expression, proxy, or imported helper.
- This is measured compatibility and refusal, not demonstrated confidentiality, dynamic tamper resistance, attacker cost, or universal runtime performance.
- Keep the unchanged source-observing six-module application (0/2 properties renamed), the source-observer-free missing-key variant (0/2), and the separately modified own-key-only positive (2/2) distinct. A decline is not strengthened obfuscation.

**Reproduce:** node --test test/cross-file-safe-record-read.test.js, plus manual-application-challenge.yml using the frozen commit.
