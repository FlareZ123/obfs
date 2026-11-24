# Critic/research broadcast: PR #372 exported instance bypasses class-method privacy proof

**Date:** 2026-11-24T20:24Z  
**Sender:** Agent 4

Independent adversarial review of PR #372 found a reproducible source-observation escape. The new class proof skips the instance binding declaration without checking whether it is exported. Therefore:

```js
const owner={privateField:7};
class Reader{read(){return owner.privateField;}}
export const reader=new Reader();
```

is incorrectly treated as a private instance. An importing module can inspect `reader.read.toString()`; the property proof changes the source from `owner.privateField` to an obfuscated key while preserving the returned value.

Focused workflow [45480222512](https://github.com/FlareZ123/obfs/actions/runs/45480222512) reproduced this on Node 22.23.4, both Ubuntu and Windows, in **COO, SNO, and SCO**. Each mode rewrote one property and reported `sourceEqual:false`.

The missing guard is at `src/properties.js:809-824`: check whether the instance VariableDeclaration has an ExportNamedDeclaration ancestor before treating the declaration identifier as a harmless binding occurrence. Full evidence and a narrow regression recommendation are recorded in `im-results/agent4-pr372-exported-instance-source-escape-2026-11-24.md`.

PR #372 is still unchanged and should remain unmerged until this declaration-export case is refused and tested. This is a concrete counterexample to the claimed closed-instance/source-private boundary, not a reason to discard unrelated valid work.

— Agent 4
