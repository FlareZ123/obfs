# SCO: evaluated free host bindings hidden inside `typeof` expressions

**Agent 36, 22 November 2026. Intermediate compatibility finding.** This
extends the earlier [unqualified operand analysis](sco-unqualified-typeof-ambient-audit-2026-11-22.md).
The bounded migration compiler remains a static syntax checker; this document
does not establish complete lexical closure, universally preserved host
semantics, attacker resistance, or any 2.5× runtime guarantee.

## Falsifiable source-boundary mismatch

The previously admitted `typeof externalBridge` expression is only the
simplest host-state witness. Even when a parser's `typeof` operand is not
an Identifier node, **evaluating the operand** can read the injected browser
binding:

```js
return typeof (0, externalBridge);
return typeof (externalBridge, 0);
return typeof externalBridge.value;
return typeof externalBridge?.value;
return typeof (externalBridge || null);
return typeof ({captured: externalBridge});
```

Node.js v22.16.0 observations with `node:vm.runInNewContext` comparing
`{externalBridge:{value:41}}` to `{}`:

| Operand | Injected-model result | Empty-model result |
| --- | --- | --- |
| `typeof (0,externalBridge)` | `'object'` | `ReferenceError` |
| `typeof (externalBridge,0)` | `'number'` | `ReferenceError` |
| `typeof externalBridge.value` | `'number'` | `ReferenceError` |
| `typeof externalBridge?.value` | `'number'` | `ReferenceError` |
| `typeof (externalBridge||null)` | `'object'` | `ReferenceError` |
| `typeof ({captured:externalBridge})` | `'object'` | `ReferenceError` |

These are **controlled independent V8 realms**, not observations from an
actual Chrome page or the deployed SCO server. The user source can be
migrated from a browser with extension-added globals into Node without a
matching binding. The originally successful `typeof` read may become a
thrown error.

## Narrow compiler correction

The shared `src/sco-selective-partition.js::firstUnprovedTypeofReference`
now visits evaluated Identifier references inside each `typeof` operand
expression tree instead of recognizing only an immediately bare Identifier.
It excludes inert uncomputed property labels, and treats function-literal
bodies as lazily evaluated unless nested inside a call context. Every
evaluated name must satisfy the prior unique module declaration plus
actual ancestor lexical-scope proof, or be a known unshadowed standard
realm name. Both selected private exports/helpers and all audited static
private ESM dependencies use this same proof.

A subtle positive original-code case must remain eligible: trusted Node
selected-private HMAC/helper code may use

```js
const modules = await import('node:assert/strict');
return typeof modules.equal;
```

Its local `modules` binding is not initialized by a primitive AST literal.
The compiler now recognizes this narrowly as a local value from an
explicit literal `node:`-prefixed module validated by Node's `isBuiltin`,
excluding the preexisting disallowed loader-capability modules. Relative,
computed, package and arbitrary dynamic imports remain unproved. The
generated client code for accepted inputs is unchanged by this build-time
admission logic.

## Source-pinned red/green verification

- [Red-first two-platform run 44999752067](https://github.com/FlareZ123/obfs/actions/runs/44999752067),
  source `06112d1ed832e68a0379ddeb70a993005acc6957`:
  both OS jobs failed the new composite rejection assertion on
  `return typeof (0,externalBridge)`. Each job also contained an
  independent Agent35 local URL constructor refusal failure from
  contemporaneous main; the failure is explicitly not attributed to this
  `typeof` change.
- [First integrated run 44999939947](https://github.com/FlareZ123/obfs/actions/runs/44999939947),
  source `dd991973d8c08673c9678466ca05aba90f53183e`:
  the extended free-name scanner rejected a previously admitted trusted
  Node builtin import-dependent local `typeof modules.equal`; the
  original positive source was preserved as a mandatory regression.
- [Corrected two-platform run 45000027567](https://github.com/FlareZ123/obfs/actions/runs/45000027567),
  source `379295a1334008a286bb4a20abe2905e40a39a02`:
  Ubuntu and Windows **both passed** the graph workflow's generated SCO
  graph example, complete SCO graph/private-host selected suites and
  strict JSDoc. The source included Agent35's current URL owner guard.
  New cases exercise six composite unsafe expressions in direct,
  child and transitive leaf routes, plus three safe composite local
  programs over the same three routes.

## Scope and release consequences

The scan is intentionally conservative. It can decline valid programs
when there are multiple identical lexical names or a complex unproven
binding initializer. It does not follow arbitrary callback execution or
prove that every function call within an operand behaves identically on
two hosts. Direct free host reads outside `typeof`, prototype indirection,
dynamic global access and arbitrary reflective aliases remain broader
open issues. The additional AST walk runs at compile time; no runtime
latency measurements or higher security resistance are claimed here.
The repository release status is still **RELEASE-BLOCKED**.
