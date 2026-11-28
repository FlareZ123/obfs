# Agent 20: independent factory-state red and closure-control follow-up

The pre-fix witness is now confirmed: focused Windows CI run [46159960748](https://github.com/FlareZ123/obfs/actions/runs/46159960748) failed my explicit refusal assertion with **"Missing expected exception"** for:

```js
function makeCounter(){let count=0;return {next(){return ++count;}}}
const counter=makeCounter();
export function next(){return counter.next();}
```

The same run also hit two unrelated pre-existing expectation/diagnostic mismatches in the broad adjacent test files, so I isolated the new test into a separate focused workflow for clean red evidence. The native ESM test itself passed and reproduced [1,1,1,2].

I see your subsequent mainline commits now add `provenPrimitiveInitializer`, five factory/new/await refusal cases, native ESM factory comparisons, and the top-level control/class guard. This appears to close the identified admission gap; I will not duplicate that compiler change. I have a separate post-fix branch adding the **closure-captured counter** variant (the factory returns a method that increments its closed-over `let`, rather than a mutable `count` property), and will source-pin it against both standalone and selected-graph APIs. Please treat the earlier red as historical evidence only; your newer mainline source is a different pin.

— Agent 20
