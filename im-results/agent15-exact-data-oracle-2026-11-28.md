# Exact-data semantics and property-yield review — Agent 15, 28 November 2026

**Status: intermediate, test-only engineering evidence. NOT an established security result, a full-suite acceptance receipt or a reason to change the RELEASE-BLOCKED decision in results/README.md.**

## Why an exact oracle

JSON.stringify parity is lossy: -0 becomes 0, NaN becomes null, sparse array holes become indistinguishable from explicit undefined, and repeated references serialize identically to separate equal objects. Such equality alone cannot establish native/emitted JavaScript semantic compatibility. The new bounded oracle preserves primitive types/values, BigInt, symbols, own descriptor/key order, extensibility, holes, aliasing and cycles; it refuses proxies, accessors, callable values, unsupported prototypes and known exotics instead of attempting unsafe introspection. It does not prove arbitrary observational equivalence or inspect function effects, prototype internals, Error stacks or browser host objects.

## Reproducible source

- Review branch: agent15/exact-data-oracle-review-20261128, initially built from main SHA 20fe4d11307b27ef7de59d06c104e63d0137a60e; first integration commit d6cc926d547a13a889087c33859a9ae6d79dbdc8. **No production src/ or bin/ changes.**
- sims/semantic-data-oracle.js: snapshotDataGraph plus captureDataCompletion, which captures returned or thrown data and avoids reclassifying an oracle refusal as a program exception.
- test/semantic-data-oracle.test.js: JSON-collision and oracle refusal controls.
- test/semantic-data-oracle-crossfile.test.js: fresh child-process real Node ESM multi-module graphs; 10 cases in each COO/SNO/SCO core compiler mode, with ordinary positive and own-key reflection refusal. A core compiler graph is **not** the SCO HTTP or SNO launcher product.
- test/semantic-data-oracle-completion.test.js: exact return-versus-throw and thrown scalar/alias values in each mode; logs rewrite count separately from semantic agreement. Earlier source syntax typo repaired at ecab62789c7c2d2ddfe989d77ecd0452a6246a49; [CI 46129340134](https://github.com/FlareZ123/obfs/actions/runs/46129340134) reached runtime: every 6 throw shapes × 3 modes had zero private-property rewrites, despite matching native/emitted values, while ordinary -0 return had 2 rewrites/mode. The previous incorrect assertion demanding a throw rewrite is now replaced with an explicit refusal-coverage record. Do not count refused equality as protected correctness.
- test/semantic-data-oracle-external-trace.test.js: real Node ESM, with out-of-graph callback observing scalar values, object keys and active mutation of a passed owner. Captures callback events and exported values in the same snapshot, retaining aliases. A plain control must actually rename; escaped-owner controls must refuse. This is a compatibility falsifier, not hostile-host secrecy.
- test/semantic-abrupt-yield-probe.test.js: 10 additional local-helper, direct-throw, caught-throw and alias shapes × 3 core modes, separating equality and actual property-renaming yield.
- jsconfig.external.json registers all these for strict JSDoc. Existing manual-validation.yml focused jobs used, no new workflow.

## Verified versus pending

The 27-Nov donor oracle run [45924847964](https://github.com/FlareZ123/obfs/actions/runs/45924847964) and ESM cross-file run [45924991416](https://github.com/FlareZ123/obfs/actions/runs/45924991416) passed Linux/Windows on their exact earlier source revisions.

Current-main-based standalone oracle focused [46129468865](https://github.com/FlareZ123/obfs/actions/runs/46129468865) passed Ubuntu and Windows, exact review source d6cc926d547a13a889087c33859a9ae6d79dbdc8, including configured JSDoc. This green pin **does not cover later tests**.

Review branch initially queued exact-head focused tests: cross-file 46129472400, completion 46129475778, revised completion [46129755347](https://github.com/FlareZ123/obfs/actions/runs/46129755347), external callback [46129712605](https://github.com/FlareZ123/obfs/actions/runs/46129712605). Subsequent abrupt-yield probe was dispatched at commit 04453381e6120d96a9fec28eaa6fe37308faf1b7. Check statuses before claiming evidence. Earlier superseded callback-source runs do not certify the revised fixture.

**Limitations:** The corpus is finite and bounded; any nonzero transform count is only shape-specific, not a broad property-renaming completeness proof. This is not an independent static-recovery, dynamic-extraction, tamper, environment-lock or paired 2.5× performance gate, and does not change the frozen PR #384 security decision.

## Real Chromium extension (later source revision)

At production-unchanged branch revision a2933a35416b061bd5ec28905b43234db5ca5ab2, test/semantic-data-oracle-browser.test.js extends the source-paired corpus into an actual headless Chromium ESM graph under same-origin Content Security Policy. Its independent HTML runner is **outside** the supplied obfuscation graph. Four cases (plain positive, external scalar+alias callback, owner key escape, owner mutation) are each run as native, COO, SNO and SCO distributions: 16 browser ESM evaluations in one real browser process. The host uses Object.is and Number.isNaN for values JSON would collapse, asserts original browser output against independent expected observations, and requires nonzero private-key rewrite for each plain mode while requiring zero for escaped owner cases. Windows focused runner skips only the Chromium launch; its strict JSDoc still runs.

Focused manual-validation browser test dispatched at this revision but its status could not be retrieved yet: GitHub Actions API returned a 15-minute rate limit at 09:24 UTC. This source is **not** a browser parity pass until the queued run is actually green. No browser runtime claims should be made from the source alone.
