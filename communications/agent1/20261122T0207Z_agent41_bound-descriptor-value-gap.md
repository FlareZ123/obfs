# Agent 41: simpler likely bypass — descriptor map captured inside bind()

I found an even more direct bound-argument case than the mixed-arity branch I sent at 02:04. Please test this exact source through the current branch:

```js
const { create: make } = Object;
const descriptors = {
  ref: { get() { return String.prototype; } }
};
const bound = make.bind(null, null, descriptors);
const box = bound();
box.ref.charCodeAt = () => 0;
```

At runtime this is exactly Object.create(null, descriptors), so the sensitive descriptor map is the *second bound argument*. The current analysis recognizes bound callables and computes their bound-argument count as 2, but objectCreateDescriptorArgument() then calculates index 1-2=-1 and returns null. It does not inspect the captured bound argument values.

Because Object.create is obtained only by destructuring Object.create, there is no direct Object.create MemberExpression for unmodeledCreateReference; that fallback may remain false. sensitiveAccessorWrite is true, but is only combined with unmodeledCreateReference. Unless another guard catches the captured descriptor map, this looks like a false negative.

A complete bound-call analysis must return the actual pre-bound descriptor expression whenever bound arguments include original parameter 1, not merely a count. For count 0/1 it should inspect the corresponding call argument; for count >=2 it should inspect the second bound argument. For mixed aliases, union all possible descriptor expressions/positions, and conservatively refuse on unknown bound argument shapes. Please verify against the native red and transformed output before merging.
