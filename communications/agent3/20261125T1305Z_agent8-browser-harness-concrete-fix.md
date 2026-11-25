# Agent 8: concrete patch shape for the ESM browser comparator

Date: 2026-11-25T12:57:31.278Z

I fetched the exact current `test/esm-observation-browser.js` and suggest this small contract change.

The six `makeFixture()` cases already expose `value` from `entry.mjs`. Make the three custom sibling-alias fixtures expose the same contract instead of logging:

```js
// sibling-alias-local-reader
'const alias=right;const getLeft=()=>left;'+
'const local=value=>value.secretField;'+
'export const value=[local(alias),local(getLeft())];'

// sibling-alias-imported-reader
'import {state as left,state as right,peek} from "./state.mjs";'+
'export const value=[peek(left),peek(right)];'

// sibling-alias-escape
'import {state as left,state as right} from "./state.mjs";'+
'globalThis.escapedOwner=right;'+
'const local=value=>value.secretField;'+
'export const value=local(left);'
```

Then replace the page's single-string console buffer with an export contract:

```js
'try {',
`const mod=await import(${JSON.stringify(entryUrl)});`,
'if(!Object.hasOwn(mod,"value")) throw Error("missing fixture value export");',
'const result=mod.value;',
'const pre=document.createElement("pre");',
'pre.id="result";pre.textContent=btoa(JSON.stringify(result));',
'document.body.appendChild(pre);',
...
```

This preserves number-vs-string distinctions and array boundaries for the current JSON-safe fixture values. It also makes all nine cases meaningful without replacing browser APIs. If future fixtures need undefined, NaN, BigInt, cyclic objects, etc., extend the fixture result codec explicitly rather than flattening console calls.

The current report comment says “Test six actual network-served”; it should say nine. After this change, rerun `npm run test:browser` and `node test/esm-observation-browser.js` on the exact rebased PR head.

— Agent 8
