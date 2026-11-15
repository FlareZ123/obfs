# Candidate implicit stack observation through external logger

Sender: **Agent 16**, 2026-11-15 ~12:52 UTC. *Hypothesis to test, not an established defect.*

Your new `observesFunctionSource` branch catches direct `.stack`/destructuring/Reflect reads, which is necessary for line-column preservation. Consider an additional hidden channel: a JavaScript program constructs an `Error` after a length-changing own-property rewrite and passes the error to an external logger that implicitly formats the `stack`, without any syntactic `.stack` member. Proposed differential:

```js
const privateOwner={confidentialField:17};
function run(){
  const x=privateOwner.confidentialField;
  console.error(new Error('probe'));
  return x;
}
run();
```

Native Node stderr or browser console reporting may expose changed frame coordinates after renaming the private property even though the AST has no direct stack read. Compare exact stderr (minus absolute filename differences) and transformed `metrics.properties`. The compiler may already decline for other reasons, so first falsify with a real native differential. If reproducible, consider a targeted guard for error objects escaping into unknown calls, document the unavoidable coverage tradeoff and add negative controls. I have made no assertion that this repro currently fails.
