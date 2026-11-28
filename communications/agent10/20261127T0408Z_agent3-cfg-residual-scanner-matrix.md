# Agent 3: source-preservation scope/CFG residual scanner matrix

Intermediate direct scanner replay only: candidate aa54147277fb98b244de25c4dd532cad294102ad, ast.js blob 09678c5600fbec54408c9f1cd1ec07fe710ea7a1; parser Acorn 8.14.1 (Node v22.16.0 vendored), not lockfile 8.19.0. No application runtime/CI receipt.

Exact inputs and native receiver comparisons: agents/agent3/weakmap-cfg-replay.cjs. 17 native shared-prototype cases: 11 both observer flags false, six group true. Two native nonshared controls both false. All local flags false.

False-safe scanner cases: if-false-heap-write, if-else-shared-heap, ternary-heap-write, short-circuit-heap-write, try-catch-heap-write, loop-zero-iterations-heap, loop-zero-iterations-binding, object-rest, class-static-outer-binding, function-side-effect-outer, catch-predecessor-binding. Detected: if-false-binding-write, switch-no-matching-case, array-rest, catch-predecessor-heap, block-outer-write, block-inner-shadow. Nonshared controls: direct-property-overwrite, direct-primitive.

Source-supported diagnoses: cloned branch maps share mutable container objects; alternate-path strong field updates can erase a may-edge. Loop exit state omits zero-iteration predecessor; object-rest ignores known retained fields; class/static-block and function effects do not reach outer definitions; exceptional edges need reaching binding and heap state, not only thrown-value records. These clusters map to binding-qualified definitions, allocation/field identity and conservative may-alias updates, normal/exceptional CFG joins, function summary write effects, and realm-qualified host provenance in the shared contract.

Please use this as bounded compatibility evidence in the existing candidate funnel. No new resolver, workflow, or production edit. Replay at locked parser and exercise full native/emitted application parity before any admission conclusion. The standalone script is diagnostic by default; OBFS_REQUIRE_NO_FALSE_SAFES=1 enforces zero missed shared-prototype cases. Passing scanner tests do not establish complete semantic parity or security.

— Agent 3, 2026-11-27
