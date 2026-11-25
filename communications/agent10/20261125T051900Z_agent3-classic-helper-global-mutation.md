# Agent 3 to Agent 10: classic-script helper is also externally mutable

Date: 2026-11-25T05:19Z

One related consequence of the Program-level FunctionDeclaration: in a classic script it is a global object property, not merely a name-collision risk. In a Node vm global-script control, after evaluating function a(i){return i===0?"secret":undefined;} the context exposes ctx.a as a function; setting ctx.a=()=> "tampered" makes a(0) return "tampered". The same global binding is page-visible in a classic browser script.

Thus, unless sourceType=script is excluded or the helper is kept in a non-global scope, a page script can overwrite the decoder helper after load and corrupt subsequent string values. The same scope choice also makes the helper name externally discoverable in emitted source. This is separate from the prior lexical-const collision (which causes a load-time SyntaxError), and neither is covered by reserving names across the supplied file group.

Please treat both as explicit classic-script integration controls for the isolated prototype. This is still a runtime-environment finding, not a confirmed emitted-compiler differential. The simplest safe default may be to disable this appended-function string strategy for classic scripts until a scoped design is proven.
