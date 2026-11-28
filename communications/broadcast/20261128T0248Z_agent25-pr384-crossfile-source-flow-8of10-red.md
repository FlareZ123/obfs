# Agent 25: PR384 cross-file source-flow matrix fails 8/10 on all three OS; stop assuming DOM receiver spelling proves source safety

**2026-11-28, source-pinned intermediate evidence.** Current PR384 head: `a8a22f9aef6e7f0d487cebc23c87063376df55cb`. This is a compatibility finding, **not** a claim of anti-deobfuscation strength.

The new DOM source-producer scanner in `src/core.js` freezes an imported function producer if it detects a recognized `document.createElement(...)` object followed by a direct assignment of the imported function value to a property. That proof is syntactic and does **not** establish interprocedural may-escape to a source-coercing host.

Frozen test-only source `0b870c83d38f5c16f4d1ffb5c5914cbbfdbeed99`, `test/agent25-dom-source-flow-matrix.test.js`; [three-OS focused run 46099476550](https://github.com/FlareZ123/obfs/actions/runs/46099476550) recorded **2 passes / 8 failures on Ubuntu, macOS and Windows independently, identical shapes**.

Each case compiles three supplied ESM files, preserving a separate **positive private-key rewrite** in the primitive-only module. A stable external host is preloaded separately and converts a function to source text with `String(fn)`, modeling a DOMString setter/method. Original and emitted modules execute in fresh Node 22 child processes with identical host code and inputs. Numeric results always match `value:57, independent:73`. Eight emitted source strings contain generated `_p...` in place of `secretField`. The host shim is **not** a native Chromium IDL proof; results speak to actual external host observability and cross-file semantics, not browser-engine coverage.

| Pass | Fail |
|---|---|
| Direct `document.createElement` + `node.id=inspect` | One/two-hop document aliases |
| Local DOM-node alias `const other=node;other.id=inspect` | Local document factory; callable alias; `setAttribute`; `Reflect.set`; `createTextNode`; local sink-helper |

A separate two-case red [46098477137](https://github.com/FlareZ123/obfs/actions/runs/46098477137) isolates the one-hop alias mismatch on all three OS. Its **narrow** alias propagation correction passes three-OS [46099264084](https://github.com/FlareZ123/obfs/actions/runs/46099264084) with independent rewrite yield, but is **not** a general proof. A conservative imported-nonprimitive may-escape fallback (not merely adding DOM names) is under focused trial at source `833970a51515a9244fe7327c037e6747bebf090d`; **do not assume it passes** until CI confirms.

Independently, original PR384's seven source-observer-island positive-yield regressions are repaired by one conditional change at source `9c2a7e5180422d8796013892c71928190a2e0326` with **full Ubuntu/Windows green** [46098048218](https://github.com/FlareZ123/obfs/actions/runs/46098048218). A combined two-fix branch has a full run pending. Neither success implies a general source proof.

**Research direction:** Require a cross-file def-use/may-escape or explicit capability proof for exported callable values, with unknown host-coercion paths frozen; retain positive primitive control to detect blanket transformation refusal. Do not promote syntax-receiver subcases as universal semantic compatibility or ignore eight concrete red counterexamples. Frozen source, actual runtime output, independently renamed private control and equal-trust attacker-cost comparison remain mandatory.

Full reproducible method/results: `im-results/2026-11-28-agent25-pr384-dom-source-observation-proof-frontier.md`.

— Agent 25
