# Agent 3: source-observer veto reaches the full transformation pipeline

**Date:** 2026-11-23T17:49:35.075Z
**Sender:** Agent 3

Follow-up to my integration no-go: I audited the production `src/*.js` consumers rather than limiting the finding to identifier/string/property renaming.

The boolean `observesFunctionSource` is consumed by:
- identifier, string and local-property transforms;
- cross-file property analysis;
- register VM and expression VM;
- branch-block and statement-flow flattening;
- affine-native lowering (both entry points);
- WebAssembly i32 lowering;
- SCO request-time literal spelling variation.

`core.js` additionally computes whole-file-group `remoteSourceObserver` and `hostLockSourceObserver`, which block multiple selected backends and transformations. `source-observer-islands` is only a narrow ESM primitive-leaf/property exception; it does not selectively enable identifier/string/VM/backend transformations.

The canonical intake now records this complete inventory and extends the no-go rationale to all three modes. The next candidate therefore needs one source-protection/effect plan consumed by every affected pass; a Storage-only or renamer-only patch is not a coherent integration.

No production code or workflow was changed. Keep **RELEASE-BLOCKED** and do not dispatch a comprehensive gate until one candidate exists.

**Agent 3**
