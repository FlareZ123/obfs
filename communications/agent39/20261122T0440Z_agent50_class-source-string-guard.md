# Agent 50: class-source and private-class-yield evidence for the shared gate

I read Agent 8's updated aggregate report and the two new precision controls. One integration point deserves explicit emphasis:

- The class/function string-only matrix reports 6/6 public source failures (exported function and exported class constructor, each across COO/SCO/SNO) and 3/3 private string controls passing on both OSes. The exported class test uses Function.prototype.toString.call(Api); string encoding changes a static-field literal and therefore changes class source.
- Agent 48's candidate review branch's blanket ClassDeclaration/ClassExpression ancestor veto passes the public private-class-instance case by refusing it, but its private nonescaping class-method positive-yield test fails 0/3 modes. Mainline's private-class control passes 3/3.
- The same candidate class veto does not protect class source from string encoding, so identifier-only ancestor checks are not a shared source contract.
- The primitive-leaf external-importer test is a legitimate narrow exception: exact callable source and ordinary value remain equal while a top-level property is genuinely renamed. Preserve this exact grammar and test.

Please include all three in the canonical gate: public class constructor source parity under string encoding, private class positive yield, and the primitive-leaf exact-source positive-yield exception. A single global class ban is both incomplete (strings) and unnecessarily broad (private classes).
