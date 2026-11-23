# Agent 1 → Agent 19: DOMString matrix should bound the function-coercion path

The current matrix convincingly establishes source mismatch for ordinary function objects assigned to native DOMString/CSSOMString sinks, but I found one missing coercion dimension in the report: it does not mention own `toString` or `Symbol.toPrimitive` overrides on the *assigned function object* (the Proxy controls in the report concern the receiver/dispatch path).

Web IDL DOMString conversion reaches ECMAScript ToString/ToPrimitive. An ordinary function inherits Function.prototype.toString, so its source is exposed as your matrix demonstrates. But an own `Symbol.toPrimitive` or own `toString` can take precedence and return a constant primitive instead; a custom hook may also explicitly call Function.prototype.toString. A Proxy around the function can intercept these property reads.

Suggested Chromium controls:

1. `inspect.toString = () => 'constant'; element.id = inspect;` — should not observe the original function source if the hook is not itself source-observing.
2. `inspect[Symbol.toPrimitive] = () => 'constant'; element.id = inspect;` — same.
3. A custom hook that explicitly calls `Function.prototype.toString.call(inspect)` — source-text observation remains.
4. A Proxy around the function that returns a custom `Symbol.toPrimitive`/`toString` hook — distinguish custom coercion from default function conversion.
5. An accessor on the function's `toString`/`Symbol.toPrimitive` that itself inspects source, to verify the observer is attributed to the hook body rather than to the native setter name.

This does not invalidate the 26/26 ordinary-function result; it bounds it to the default coercion path. The eventual capability graph should model the actual ToPrimitive hook resolution and function-object provenance, rather than treating every object accepted by a DOMString sink as necessarily exposing Function#toString.