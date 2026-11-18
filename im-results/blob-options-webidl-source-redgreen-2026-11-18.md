# Blob options Web IDL function-source observer: bounded red/green repair

**Agent 3, 2026-11-18 UTC. Intermediate semantic-correctness evidence.** This is neither source confidentiality nor attacker-resistant obfuscation. It resolves the previously reported direct and reflective options gap in [the open investigation](blob-options-webidl-source-open-2026-11-17.md).

## Reproducible counterexample

Native Node.js 22 evaluates \`new Blob([],{type:protectedLabel}).type\` to the ASCII-lowercased \`Function#toString\` of \`protectedLabel\`, including its name and body. \`new Blob([],{endings:protectedLabel})\` throws a TypeError whose message includes the source. The function may later be renamed or have its body rewritten by a transform, changing program-observable output without changing its invocation result.

The pre-fix AST considered only the first argument of native Web dictionary constructors. It did not inspect Blob's second \`BlobPropertyBag\` argument. The no-op-or-transform decision therefore incorrectly returned \`observesFunctionSource(...) === false\` for \`new Blob([],{type:protectedLabel}).type\`.

The standalone 12-case [Node differential test](../test/blob-options-function-source-observer.test.js) includes direct Blob construction, options.endings error diagnostics, global and destructured aliases, assignment alias chains, direct and detached \`Reflect.construct\`, \`.call\`, \`.apply\`, and nested \`Reflect.apply\`. Each case first verifies that renaming the original function changes the native observation. The test then requires the detector and COO/SNO emission to retain native output. A separate positive control passes literal primitive options and demands **two real renamed properties** in both modes.

## Actual two-platform red/green pins

- **Red:** [manual Web IDL run 44252144585](https://github.com/FlareZ123/obfs/actions/runs/44252144585), exact checkout \`68586f5b05837ae5219dd5e5891bb9b54435874f\`. Both Ubuntu and Windows failed only the new observer test at the first \`Blob options.type direct\` case: \`false !== true\`. Native source text and the private-property positive control passed on both platforms. The test command reported **140 passed, 1 failed of 141**.
- **Green:** [same manually dispatched workflow 44252370803](https://github.com/FlareZ123/obfs/actions/runs/44252370803), exact checkout \`ecdb3c62f0690c8178045ff9d450e473da0bbb74\`. **141/141 Node tests passed on Ubuntu and 141/141 on Windows**; both strict source-transform JSDoc checks passed. Ubuntu's existing real Chromium Web IDL differential passed. The Chromium suite is not a Blob-specific witness.

## Implementation and scope

\`src/ast.js\` now tracks Blob constructors independently from the broader \`Headers\`/\`URLSearchParams\` Web-dictionary family, through simple assignment and \`globalThis\` destructuring. Direct CallExpression/NewExpression classification inspects the optional second Blob argument with the existing conservative nested record coercion helper. Reflective construction consumes the first two Blob operands from an inline argument array. Other Web-dictionary constructors retain their original first-argument handling so positive rewrite yield does not globally collapse.

The scanner remains syntactic and incomplete for opaque/host-supplied constructor aliases, arbitrary proxy behavior, \`Function#bind\` constructor wrappers, dynamically generated code, and fully instrumented attackers. The selected primitive control establishes transformation coverage only for one closed-world private CJS pattern. This changes compatibility admission, with no measured additional protection over an ordinary minifier and no 2.5× application-wide runtime claim.

## Reproduce

Run \`node --test test/blob-options-function-source-observer.test.js\` on Node 22 with declared npm dependencies, then use the existing manual-only \`.github/workflows/manual-web-idl-source.yml\` to exercise the 141-test group, strict typing and Ubuntu Chromium.
