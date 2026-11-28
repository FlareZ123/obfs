# Avoiding observer/provenance grammar drift in cross-file property renaming

**Agent 10, 28 November 2026 — design proposal, not a validated compiler implementation.**

## Motivating executed counterexamples

Two independently reproducible adversarial-host input families have crossed a disagreement between \`src/ast.js::isDefinitelyPrimitive\` and \`src/cross-properties.js::mayBeBoxedPrimitive\` in the Agent 11 consolidated source compiler (\`26ac0ef3ab4dbf22ecc3671a94186bdb9cc31175\`).

1. **Local or imported primitive receiver:** \`export const n=7\` in a different module, or \`const n=3+4\` in the consumer, followed by \`await n.toLocaleString('en-US')\`. Under a real hostile host where \`Number.prototype.toLocaleString\` dynamically imports \`owner.mjs\` and returns \`Object.keys(owner)\`, the native source exposes \`["secretField"]\`, while the emitted cross-file transform incorrectly exposes \`["_p..."]\`. Node COO/SCO/SNO source-pinned negative CI: [46158841256](https://github.com/FlareZ123/obfs/actions/runs/46158841256), [46159232896](https://github.com/FlareZ123/obfs/actions/runs/46159232896); actual Google Chrome / CSP negative [46160168776](https://github.com/FlareZ123/obfs/actions/runs/46160168776).
2. **Flow-narrowed string receiver:** \`const dynamic=process.argv[2];const n=typeof dynamic==='string'?dynamic:null;await n.toLocaleString('en-US')\`. The per-file observer knows that \`n\` is primitive and so suppresses its function-source warning. The cross-file boxed-safety analysis only considers the unresolved \`dynamic\` arm and \`null\` arm independently, fails to propagate the \`typeof\` predicate, and incorrectly permits private owner renaming. The preloaded hostile \`String.prototype.toLocaleString\` reenters \`owner.mjs\`, causing a native/emitted key mismatch. Baseline all-three-OS RED [46161215633](https://github.com/FlareZ123/obfs/actions/runs/46161215633).

The focused corrective guard in draft [PR #414](https://github.com/FlareZ123/obfs/pull/414) repairs those **known** cases; it does not establish that all grammars and host effects are aligned. The proof obligation is stronger than "the source observer did not report Function#toString": an untrusted native method may load and observe an unrelated module and key spelling.

## Proposed shared abstract interpretation contract

Rather than maintaining two unrelated whitelists of AST expression types, introduce a shared, explicit *value-and-effect* abstract domain. An intentionally conservative first version could track:

- \`MAY_NULLISH\`: null/undefined;
- \`MAY_NON_NULL_PRIMITIVE\`: boolean, string, number, BigInt, Symbol;
- \`MAY_OBJECT\` and \`MAY_FUNCTION\`: ordinary objects versus callable values, with an explicit overlap rule for functions;
- \`MAY_HOST_DISPATCH\`: expression has a path to a mutable external getter, method, conversion, import/loader, or other host-controlled effect.

For operators with known result types, preserve the syntactic proof separately from operand-effect analysis: a numeric binary expression returns a primitive *on normal completion* but its operands may themselves execute hostile conversion hooks. A \`TemplateLiteral\` returns a string but its substitutions may invoke user-controlled ToPrimitive. A conditional must join value possibilities in both branches and propagate a narrowly validated \`typeof x === 'string'\` refinement only on the guarded arm. A sequence expression gets its value from the last child but must union effects from **all** children. A direct immutable ESM import can inherit only source-pinned, path-resolved, uniquely-bound producer facts. Unknown aliases/opaque readers default to the full may-set.

Keep the two existing security questions separate even if they share this engine:

1. **Function-source observer:** is it proven that no callable source bytes/spellings enter a stringifying, reflective, dynamic compiler, or byte-reading sink? \`definitelyPrimitive\` is a strong sufficient shortcut in some cases but must not silently suppress unrelated host effects.
2. **Cross-file key observer:** is it proven that no reachable host-controlled method/getter can reenter the declared or an external ESM graph and reflect a renamed own key? The relevant question is \`MAY_NON_NULL_PRIMITIVE\` **or** \`MAY_HOST_DISPATCH\` at the method receiver/call site, not just whether the expression may be a Function.

The guard should reject whenever either proof fails. Any future extension that expands positive rewrites must carry a *new executable benign positive witness* and a *hostile negative counterexample search*, not merely a static AST example.

## Backwards-compatibility and performance acceptance

Do not assert generic application preservation or compiler quality from a successful malicious-host refusal: it may simply disable all properties. Require (a) unpatched RED / repaired GREEN source output under Node COO/SCO/SNO and real Chromium/CSP; (b) a legitimate cross-file protected field that is demonstrably **rewritten** in the benign closed world with unchanged output; (c) no changes to external API / reflection / dynamic property contracts; (d) full native/emitted behavior suites across platforms; and (e) separated hot-loop performance measurements with the obfuscated runtime at most 2.5× the original. Compiler preprocessing cost and runtime overhead are different metrics.

Tests already available or queued:

- Negative numeric/import/prototype families: \`test/agent10-boxed-binary-host-source.test.js\`, \`test/agent10-imported-boxed-host.test.js\`, \`test/agent10-ambient-prototype-host.test.js\`; guarded three-OS GREEN [46159912897](https://github.com/FlareZ123/obfs/actions/runs/46159912897), [46159916555](https://github.com/FlareZ123/obfs/actions/runs/46159916555), [46159919665](https://github.com/FlareZ123/obfs/actions/runs/46159919665).
- String flow refinement: \`test/agent10-typeof-narrowed-host-source.test.js\`; baseline all-three-OS RED above; guarded focused [46161246301](https://github.com/FlareZ123/obfs/actions/runs/46161246301) under evaluation.
- Positive minimal corpus: \`test/agent10-imported-primitive-positive-yield.test.js\` with real integer private field changes and runtime equality, [46161740572](https://github.com/FlareZ123/obfs/actions/runs/46161740572) pending.
- Deterministic broader grammar stress: \`test/agent10-host-grammar-fuzz.test.js\`, 248 source compilations seeded \`0x317a1b5e\`, three-OS GREEN [46159532089](https://github.com/FlareZ123/obfs/actions/runs/46159532089); this only checked admitted rewrites, not comprehensive attack coverage.

**Threat-model qualification:** an attacker in SCO or COO controls the browser host; in SNO the attacker controls server runtime and memory. Source-level ESM behavior under the attacker-controlled realm is thus strictly stronger than original benign-host equivalence and may require refusing property rewrites whenever externally introspectable names cannot be proven closed. The shared lattice is a foundation for *soundly deciding when* to refuse, not a claim that arbitrary local execution becomes secrecy-preserving or that global release gates are met.

**Proposed next owner action:** first reproduce each operator/provenance transfer with a small 2–3-module graph and the explicit host method that observes \`Reflect.ownKeys\` or \`Object.keys\`. Then derive the shared transfer grammar from those tests, retain literal/immutable binding refinement, and bound fixed-point traversal (the present reverse-use worklist is preferable to repeated full-AST sweeps). Promote as implementation only with measured preservation of safe positive rewrite yield, native/emitted parity, and CPU budget; leave in \`workplace/\` until then.

— Agent 10
