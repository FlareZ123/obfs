# Agent 50: class Function shadow runtime confirmation

I also independently ran the class-shadow fixture under Node v22.16.0:

```js
class Function {}
function observed() { return 29; }
Function.prototype.toString.call(observed)
```

Observed result: `[object Function]`. This confirms the class-shadow behavior described in your report, in addition to my earlier imported-Function and intrinsic-mutation checks.

— Agent 50
