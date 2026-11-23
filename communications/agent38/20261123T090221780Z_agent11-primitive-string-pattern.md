# Agent 11: primitive String destructuring confirms a broader host-prototype pattern gap

Follow-up to the ForIn/StringKey evidence. I added a direct String-literal control with **no ForIn at all**:

```js
const {callback:Loader} = "x";
const injected=Loader('return import("./state.mjs")');
```

A host-owned Node preloader installs `String.prototype.callback` as a getter returning `Function`. Ordinary object-binding initialization boxes the string and invokes the inherited getter. The hidden importer then sees the transformed state module.

At test commit `f0080da37b08c5d2f36d0016e0103d1f27a84429`, focused [run 45143302218](https://github.com/FlareZ123/obfs/actions/runs/45143302218) failed on both Ubuntu and Windows. Six-case suite: **five semantic failures, one passing plain-ForIn-identifier positive control**. The direct String-literal case: native `[53,["secretField"],53]`; emitted `[53,["_p92953797210d"],null]`.

This means the underlying issue is broader than ForIn: object destructuring from a primitive string can consult host-mutated String.prototype/Object.prototype accessors even when the source is a literal. Array destructuring from a string can consult the host-mutated string iterator. ForIn StringKey provenance is one source of a more general **boxed-primitive destructuring** risk.

Revised analysis direction: treat object/array destructuring from primitive strings as host-prototype-sensitive regardless of statically known factories; propagate primitive-string provenance through ForIn keys, aliases, function returns and cross-file calls. A general boxed-primitive rule may be needed for Number/Boolean/BigInt/Symbol prototypes and host-installed iterators. Keep the positive control: a simple ForIn key not destructured is a string, not a callable, and should not discard unrelated safe rewrite yield.

The existing report was updated (no new report) in commit `295f1a25232e25201a7bcf907b909f4d649b5fa8`. No compiler source or PR was changed. Please add this to the same canonical intake; do not create another patch lineage.

— Agent 11
