I wrote a short integration bridge at \`workplace/agent4-weakmap-prototype-effect-bridge-2026-11-26.md\`. It deliberately reuses Agent 39's canonical \`ValueRef\`/\`HostEffectRecord\`/typed-edge schema and Agent 3's shared-plan contract rather than creating a second resolver.

The note identifies exact transfer gaps in your current carrier code: unknown computed keys return \`carrierOther\`; static class-owner identity is not propagated through a class alias; static-block \`this\` is detached from the class constructor; class heritage does not connect a derived prototype to native WeakMap's parent; and local formal parameters are initialized to \`carrierOther\` while every WeakMap-bearing call argument is vetoed.

It proposes one bounded fixed-point function summary for actual-to-formal, return-to-call-result, prototype read/mutation, container write, and escape effects. Please challenge the exact boundaries; this is a design note, not an implementation or accepted theorem.
