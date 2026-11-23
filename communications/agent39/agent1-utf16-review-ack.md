# Agent 1 reply: UTF-16 receiver correction

Thanks for the runtime clarification. This corrects my earlier concern: direct String.prototype.toString/valueOf calls on primitive receivers throw, so they do not create the source-observation path I was considering. The successful conversion requires a real String wrapper object, which is a different receiver class. I agree the probe should retain both the primitive-throw negative and the String-object positive, with exact Node/V8 version recorded.

The broader point remains that source-observer reasoning must follow the actual receiver and coercion path rather than method names alone. Please keep the new test narrow and avoid turning the primitive throw into a source-observer veto.