# Adversarial ESM source shapes falsify three affine symbolic-proof admissions

**22 November 2026. Agent 16. Intermediate independent reviewer evidence.**
This report concerns the attack-side AST reconstruction tool in
[PR #282](https://github.com/FlareZ123/obfs/pull/282), based on exact
original PR SHA `40fe43e726495c6c32e2fdab7594dcc71e984cb1`.
It does **not** establish an obfuscator behavior defect or undermine the
PR's narrower statement that actual compiler-emitted affine functions
are statically recoverable from published source.

## Reproducer and red-first evidence

Three adversarially hand-authored JavaScript module shapes deliberately
resemble the narrow public polyvariant affine grammar and preserve the
expected two-case switch/restoration structure.

| Source shape | Native exported observation | Unsafe original analyzer claim | Evidence |
| --- | --- | --- | --- |
| Late `const` in a returned inner block | `round1(0)` throws `ReferenceError` because the later declaration shadows the earlier read for the whole lexical block | A returned affine offset `17`, with the later declaration skipped by `block()` | [Initial red Linux+Windows gate 45034263079](https://github.com/FlareZ123/obfs/actions/runs/45034263079), `f907826a6e03dd642356d409189209fca8e1a7eb` |
| Case-local slot redeclares the normalized `_ap_input_` binding | `round1(0)` throws `ReferenceError` in the slot's own initializer | `assertRestoration` accepts the syntactic shift/OR pattern and maps the TDZ binding as normalized numeric input | [Second red Linux+Windows gate 45034619175](https://github.com/FlareZ123/obfs/actions/runs/45034619175), `396661ee91801c82d60172db039a5e3dbf2ae162` |
| ESM `export {alternate as round1}` against an unexported local affine `round1` | Public `round1(0)` returns `-123`; local `round1(0)` returns `17` | Generated-arm attacker matches the local declaration named `round1` without proving the ESM binding exposed under that name | Same second red gate, `396661ee91801c82d60172db039a5e3dbf2ae162` |

The [first adversarial test](https://github.com/FlareZ123/obfs/blob/agent16/affine-tdz-proof-counterexample-20261122/test/affine-symbolic-tdz-shadow.test.js)
verifies the native `ReferenceError`, then demands conservative static
rejection. The initial analyzer did **not** throw, so the focused test
failed with `Missing expected exception` on both platforms. The
[second test](https://github.com/FlareZ123/obfs/blob/agent16/affine-tdz-proof-counterexample-20261122/test/affine-symbolic-binding-provenance.test.js)
likewise proves native TDZ or exported-binding divergence, then fails
twice for missing conservative rejection.

These are false admissions to an independent *source reconstruction proof*,
rather than demonstrations that the real obfuscator emits such text.
They expose a general danger of symbolic analysis based solely on a narrow
expression grammar without full lexical and module binding provenance.

## Conservative repair and compatibility

The isolated [Agent 16 review branch](https://github.com/FlareZ123/obfs/tree/agent16/affine-tdz-proof-counterexample-20261122)
is based directly on PR #282's original head. It adds no second obfuscator
backend or new CI workflow.

- `sims/polyvariant-affine-symbolic-recover.js` now rejects any
  uninspected statement after a proven returned expression in a symbolic
  block and refuses a case-local slot whose identifier coincides with the
  normalized input binding.
- `sims/llm-matched-affine-static-attack.js` checks public/local
  ESM export identity for the **generated arm**. The existing ordinary
  esbuild minifier arm retains alias-aware recovery.
- Two new red-first regression files are included in
  `jsconfig.llm-matched-affine.json` and the pre-existing
  `manual-obfuscation-sample.yml` job.

The first focused green [45034378494](https://github.com/FlareZ123/obfs/actions/runs/45034378494)
at `6b8b2c583678ffdcc712f4d9facbcf29f2b1fc8d` accepts the
first TDZ guard on Ubuntu and Windows. The second focused green
[45034722710](https://github.com/FlareZ123/obfs/actions/runs/45034722710)
at `c68e9375cd9761a5d0ee3625445be36ea20ae2f2` verifies both
additional rejections on both platforms.

The **full source-matched PR workflow**
[45034846621](https://github.com/FlareZ123/obfs/actions/runs/45034846621)
completed **successfully** on Ubuntu and Windows against
`0f39d5f06c10ef3489d0ef71da90848b8d8a2ffa`, covering the original
randomized native-vs-esbuild-vs-polyvariant affine challenge suite, the
new adversarial lexical/export cases, strict JSDoc, and matched CPU
measurement. The original selected affine family remains statically
reconstructable under the proposed source-only attacker.

The three tested repairs are deliberately narrow. Arbitrary hostile JS
binding provenance is a larger language-analysis problem; a finite set
of negative cases cannot establish general proof soundness. Further
untrusted-source grammar review should examine function/parameter scope,
export namespaces, lexical hoisting, mutable bindings, and source-observable
exceptions, and retain the original compiler-emitted positive recovery set.

## Integration decision

These fixes remain isolated to the review branch pending incorporation by
the owner of [PR #282](https://github.com/FlareZ123/obfs/pull/282).
The author was notified by repository mailbox and
[PR conversation comment 7080846140](https://github.com/FlareZ123/obfs/pull/282#issuecomment-7080846140).
No standalone full-protection claim follows. The project's
**RELEASE-BLOCKED** decision is unchanged.
