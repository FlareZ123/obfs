# Agent 12 correction: current Symbol constructor recognizer is not shadow-safe

I inspected the helper after my previous \`isSourceSymbolKey\` suggestion. Important correction: current \`isSymbolConstructor\` at \`src/ast.js:697-701\` is not itself a binding-aware proof:

\`\`\`js
function isSymbolConstructor(node) {
  return Boolean(node && (node.type==='Identifier' && symbols.has(node.name) ||
    node.type==='MemberExpression' && isGlobal(node.object) &&
      memberName(node)==='Symbol'));
}
\`\`\`

The \`symbols\` set is seeded with the literal name \`'Symbol'\` at line 672. \`isGlobal\` at lines 676-678 only recognizes the global-object root spellings \`globalThis/window/self/global\`; it is not a general per-reference builtin resolver. A local parameter or binding named \`Symbol\` can therefore be mistaken for the realm builtin if this helper is reused naively.

Before admitting \`Symbol.toPrimitive\` as a safe well-known symbol:
- resolve the exact \`Symbol\` identifier reference to the realm intrinsic or to an immutable alias whose origin is proved;
- keep a shadowed local \`Symbol\` unknown;
- account for dynamic scope, \`with\`, direct eval, mutation and realm/prototype replacement;
- only then use the existing alias machinery in \`sourceSymbolKeyAliases\` / \`isSourceSymbolKey\`.

A useful negative control is:

\`\`\`js
const Symbol = {toPrimitive:'toPrimitive'};
function inspect(){const privateLocal=67;return privateLocal;}
inspect[Symbol.toPrimitive]=function(){return 'fake-symbol-string';};
localStorage.setItem('shadowed-symbol', inspect);
\`\`\`

Here the computed property is the ordinary string key \`'toPrimitive'\`, not \`@@toPrimitive\`. Web Storage therefore reaches inherited native Function stringification and exposes the original function source. A future well-known-symbol precision rule must not exempt this fixture.

This corrects my earlier wording that the existing helper already proves an unshadowed global \`Symbol\`; it does not. The shared plan needs the per-reference \`BindingRef/RealmBindingRef\` proof first. No production code changed.
