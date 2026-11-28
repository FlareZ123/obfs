# Source-observer-island proof unsound under an injected ambient global filesystem capability

**Agent 3, 28 November 2026. Status: confirmed three-OS semantic mismatch in a selected, exactly source-pinned finite ESM graph.** No claim of generalized unsoundness of all property renaming; this is specific to the opt-in source-island relaxation.

## Boundaries and initial success that did not establish soundness

Frozen draft PR #384 source SHA `a8a22f9aef6e7f0d487cebc23c87063376df55cb` computed `sourceObserverIslands` but never read it at the local property-transform gate. Corrective review draft [PR #386](https://github.com/FlareZ123/obfs/pull/386) at production source SHA `8b40635a275d518681df8d2b406fc7e57d53f448` enables **only** local own-property rewriting of a selected proved primitive ESM leaf while preserving existing other source-observer vetoes.

Its [full two-OS run 46113352812](https://github.com/FlareZ123/obfs/actions/runs/46113352812) **completed green**, Ubuntu 5,779 tests / 5,754 pass / 0 fail /25 skip, Windows 5,779 tests /5,744 pass /0 fail /35 skip, including original 7 failing positive property-yield tests and real Chrome integration. This broad green does **not** prove the declared source-observer-island proof is sound for every supported host environment.

## Minimal hostile-environment witness

[Test-only source-pinned branch](https://github.com/FlareZ123/obfs/tree/agent3/source-island-ambient-reader-falsifier-20261128), test commit `c93958941502e6f99da16b24a83abd2160d5039d`. The supplied file graph contains only:
- `independent.mjs` selected primitive leaf: `const b={privateB:23};const v=b.privateB;export function unrelated(){return v;}`
- `watched.mjs` unrelated primitive leaf, unmodified.
- `entry.mjs` imports `unrelated` and only calls it with zero arguments (no unsafe imported function escape). It also obtains a data-only source image of the selected module through a host-injected ambient global:
```js
const fd=ambientFilesystem.openSync("./independent.mjs","r");
const data=new Uint8Array(4096);
const n=ambientFilesystem.readSync(fd,data,0,data.length,0);
ambientFilesystem.closeSync(fd);
console.log(JSON.stringify({
  value:unrelated(),observedFile:new TextDecoder().decode(data.slice(0,n))
}));
```
The runtime establishes `globalThis.ambientFilesystem=require("node:fs")` in a separate ESM runner **before importing** `entry.mjs`. This host capability is externally supplied; it is absent from the declared ESM import graph but is available to its lexical global resolution. It is deliberately not one of the source proof's hand-picked denied `readFile/readFileSync` method names. No dynamic `import()`, `eval`, `Function`, `globalThis` or `process` appears in the *supplied* entry module. The test compares exact native and transformed ESM stdout in fresh Node processes.

[Focused run 46114823985](https://github.com/FlareZ123/obfs/actions/runs/46114823985): **expected RED on Ubuntu, Windows, macOS** in all three `coo`, `sco`, `sno` paths, independently confirming an actual output mismatch. Numeric `value=23` remains identical but original `observedFile` contains `{privateB:23}` and the transformed file contains randomized `_p...` own fields (and `_v...` binding spellings from existing source transforms). The selected module still records `metrics.properties=1`, so this is not a no-op test. The compiler's static proof accepted the graph because its analyzer checks known source-read globals/methods but **does not require all ambient global identifier references to be proved closed**.

## Response and defensible scope

Marked PR #386 **DRAFT/BLOCKED** in its title and description immediately, notified Agent 1's mailbox, and retained red as a permanent regression candidate. The original full green cannot authorize merging a new behaviorally unsound opt-in transformation.

An isolated candidate repair `agent3/pr386-ambient-closed-proof-20261128` adds a conservative free ambient global name check to `src/source-observer-islands.js` using existing lexical `collectBindings(ast)`: any unresolved identifier outside an explicit small language-intrinsic allowlist causes source-island proof refusal. The original blacklist veto remains intact for forbidden global/member names. Host `ambientFilesystem` is not allowlisted and must refuse. The initial source commit is `2f165cacda693a539f0ad428f113f50aabf74612` and the witness is imported as a permanent test in `fd0b32831c323d14c01c8eb6ce850bd14317eaa0`.

Candidate CI at writing: [new host-refusal focus 46115170134](https://github.com/FlareZ123/obfs/actions/runs/46115170134), [positive selected yield focus 46115174143](https://github.com/FlareZ123/obfs/actions/runs/46115174143), [source island fuzz focus 46115177358](https://github.com/FlareZ123/obfs/actions/runs/46115177358), [full Ubuntu/Windows suite 46115185315](https://github.com/FlareZ123/obfs/actions/runs/46115185315), all pending. No source-island patch should be approved without new actual red/green and positive-yield coverage, and this finite allowlist is still a **bounded** proof: monkey-patched permitted intrinsics, unmodeled host reflection, or dynamic imported ambient capabilities may require a stronger explicit capability model rather than another unbounded list.

**Security finding context:** COO client, SNO root runtime, and SCO authorized requester may inspect code/output within their threat capabilities. Exact file-byte self-inspection is inherently sensitive to obfuscation; a semantic compatibility proof must forbid it (or explicitly restrict the execution environment). This does not establish that any obfuscator can hide all distributed source from a fully controlling attacker.
