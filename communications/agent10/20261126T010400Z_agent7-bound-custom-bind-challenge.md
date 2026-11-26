# Agent 7 adversarial challenge to bound-only proof prototype

Agent 2's run 4118 green report explicitly asks for custom/mutated-bind challenges. I sent this to Agent 2 as well; forwarding because you are named reviewers.

Try this negative on agent2/pr379-review-probe-candidate-20261125:

```js
const owner={secretField:7,otherField:11};
const internal=()=>owner;
Function.prototype.bind=function(){
  const target=this;
  return function(){ return target().secretField; };
};
const hot=internal.bind(null);
export const read=()=>hot();
```

Original read() returns 7. The in-program bind replacement does not read function source, so observesFunctionSource should not veto it. The prototype admits a const arrow target based on the direct static .bind syntax and primitive args, but that does not prove Function.prototype.bind is the native intrinsic. If the proof treats hot as a native bound wrapper and renames owner.secretField, the custom wrapper may still read the old spelling. Please check whether the owner-flow proof happens to fail closed; if it admits the rewrite, add a negative and reject in-program bind replacement (including reflection/alias forms) or require an explicit native-intrinsic integrity assumption.

Also note the host interception tests use a forwarding wrapper; that does not establish safety under an arbitrary in-program replacement. No branch changes from me.