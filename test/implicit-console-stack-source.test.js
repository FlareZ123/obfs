'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Console}=require('node:console');
const {Writable}=require('node:stream');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Observe Node's native console formatting without a syntactic .stack read.
 * The fixed VM filename makes error source positions deterministic.
 * @param {string} code
 * @returns {{value:unknown,printed:string}}
 */
function execute(code) {
  let printed='';
  const output=new Writable({
    write(chunk,encoding,done) {
      printed+=chunk.toString();
      done();
    }
  });
  const logger=new Console({stdout:output,stderr:output});
  const context={console:logger,module:{exports:null}};
  vm.runInNewContext(code,context,{filename:'implicit-stack-observer.cjs',timeout:2000});
  // Stack frames above the VM belong to the test harness. Their columns
  // change between the native and emitted execute() calls even if the VM
  // source is byte-identical. Compare only the actual program's frames.
  const observed=printed.split('\n').filter(line=>
    !/^\s*at /.test(line) || line.includes('implicit-stack-observer.cjs:')).join('\n');
  return {value:context.module.exports,printed:observed};
}

/**
 * Compare source with its emitted SNO output. Console methods can format an
 * Error's captured stack coordinates even when the source never says .stack.
 * @param {string} statement
 */
function mustPreserveConsoleSource(statement) {
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;"+statement+
    "module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),true,source);
  const output=obfuscateFiles([{
    path:'implicit-stack-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'agent50-implicit-error-log',strings:false}).files[0];
  const native=execute(source);
  const transformed=execute(output.code);
  assert.equal(native.value,73);
  assert.equal(transformed.value,native.value);
  assert.match(native.printed,/implicit-stack-observer\.cjs:1:|\[Function: distinctlyNamed/);
  assert.equal(transformed.printed,native.printed,output.code);
  assert.equal(output.code,source);
  assert.deepEqual(output.metrics,{literals:0,objects:0,properties:0,bindings:0});
}

test('console.trace implicitly reveals source column without Error.stack',()=>{
  mustPreserveConsoleSource('console.trace();');
});

test('console.error directly inspects a constructed Error stack',()=>{
  mustPreserveConsoleSource("console.error(new Error('probe'));");
});

test('console.warn observes a locally aliased Error stack',()=>{
  mustPreserveConsoleSource("const problem=new Error('probe');console.warn(problem);");
});

test('console.log inspects a nested Error and an aliased logger',()=>{
  mustPreserveConsoleSource("const problem={nested:[new TypeError('probe')]};const logger=console;logger.log(problem);");
});

test('globalThis.console.error observes a computed-member Error',()=>{
  mustPreserveConsoleSource("globalThis.console['error'](new RangeError('probe'));");
});

test('computed console trace through a local logger alias reveals source',()=>{
  mustPreserveConsoleSource("const logger=console;logger['trace']();");
});

test('console.dir formats an Error created through another alias',()=>{
  mustPreserveConsoleSource("const original=new Error('probe');const copy=original;console.dir(copy);");
});

test('console.log exposes a local function name through native inspection',()=>{
  mustPreserveConsoleSource('function distinctlyNamedLocalFunction(){return value;}console.log(distinctlyNamedLocalFunction);');
});

test('console.dir exposes a function nested inside a literal record',()=>{
  mustPreserveConsoleSource('function distinctlyNamedNestedFunction(){return value;}console.dir({nested:[distinctlyNamedNestedFunction]});');
});

test('unsafe private-property rewrite changes native console.trace source column',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;console.trace();module.exports=value;";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=execute(source);
  const renamed=execute(unsafe);
  assert.equal(renamed.value,native.value);
  assert.notEqual(renamed.printed,native.printed);
  assert.match(renamed.printed,/implicit-stack-observer\.cjs:1:\d+/);
});

test('unsafe private-property rewrite changes the logged Error stack',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;console.error(new Error('probe'));module.exports=value;";
  const unsafe=source.replaceAll('distinctivelyLongPrivateField','x');
  const native=execute(source);
  const renamed=execute(unsafe);
  assert.equal(renamed.value,native.value);
  assert.notEqual(renamed.printed,native.printed);
  assert.match(renamed.printed,/implicit-stack-observer\.cjs:1:\d+/);
});

test('unsafe local function rename changes native console inspection output',()=>{
  const source="'use strict';function distinctlyNamedLocalFunction(){return 73;}"+
    "console.log(distinctlyNamedLocalFunction);module.exports=73;";
  const unsafe=source.replaceAll('distinctlyNamedLocalFunction','x');
  const native=execute(source);
  const renamed=execute(unsafe);
  assert.equal(renamed.value,native.value);
  assert.notEqual(renamed.printed,native.printed);
  assert.match(native.printed,/distinctlyNamedLocalFunction/);
  assert.match(renamed.printed,/Function: x/);
});

test('ordinary primitive logging remains eligible for real property renaming',()=>{
  const source="'use strict';const owner={distinctivelyLongPrivateField:73};"+
    "const value=owner.distinctivelyLongPrivateField;console.log(42);module.exports=value;";
  assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
  const output=obfuscateFiles([{
    path:'implicit-stack-observer.cjs',sourceType:'commonjs',code:source
  }],{mode:'sno',seed:'agent50-implicit-log-positive',strings:false}).files[0];
  assert.deepEqual(execute(output.code),execute(source));
  assert.ok(output.metrics.objects>0,output.code);
});
