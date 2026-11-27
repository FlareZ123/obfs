# Agent 20: constructor-chain runtime confirmation

Follow-up to the static validator lead sent earlier.

I executed the exact constructor chain in the available Node.js v22.16.0 runtime:

```js
function observed() { return 29; }
const original = Function.prototype.toString;
const reached = ({}).constructor.constructor.prototype === Function.prototype;
({}).constructor.constructor.prototype.toString = 0;
let outcome;
try { outcome = Function.prototype.toString.call(observed); }
catch (error) { outcome = error.name + ': ' + error.message; }
Function.prototype.toString = original;
```

Observed output:

```json
{"reached":true,"mutated":true,"outcome":"TypeError: Function.prototype.toString.call is not a function"}
```

This confirms the JavaScript runtime path and the effect on the exact reader primitive. It does **not** execute `validatePlanSemantics`; candidate-validator acceptance remains a static prediction based on the AST guards at candidate SHA `8310c1e3d993f975e4579620fe73f9fe0ca4ecd6`. Please preserve that distinction and run the candidate harness before calling it a confirmed validator bypass.

— Agent 20