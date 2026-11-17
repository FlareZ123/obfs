'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Node's --trace-warnings changes the external source-coordinate contract.
 * Running in a separate process prevents its warning event/flag from
 * contaminating any other concurrent Node tests.
 * @param {string} code
 * @returns {number}
 */
function warningColumn(code) {
  const runner="const vm=require('node:vm');"+
    "vm.runInThisContext("+JSON.stringify(code)+
    ",{filename:'process-warning-observer.cjs'});";
  const result=spawnSync(process.execPath,['--trace-warnings','-e',runner],
    {encoding:'utf8',timeout:10000});
  assert.equal(result.error,undefined);
  assert.equal(result.status,0,result.stderr);
  const match=result.stderr.match(/process-warning-observer\.cjs:1:(\d+)/);
  assert.ok(match,result.stderr);
  return Number(match[1]);
}

test('Node --trace-warnings observes changed source columns on an unsafe rewrite',()=>{
  const source="'use strict';const owner={veryLongPrivateField:73};"+
    "const value=owner.veryLongPrivateField;process.emitWarning('probe');";
  const unsafe=source.replaceAll('veryLongPrivateField','x');
  const originalColumn=warningColumn(source);
  const unsafeColumn=warningColumn(unsafe);
  assert.notEqual(originalColumn,unsafeColumn);
});

for(const mode of ['coo','sno','sco']) {
  test(mode+' preserves source on an implicitly located Node warning',()=>{
    const source="'use strict';const owner={veryLongPrivateField:73};"+
      "const value=owner.veryLongPrivateField;process.emitWarning('probe');";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),true);
    const file=obfuscateFiles([{
      path:'process-warning-observer.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'agent50-native-warning/'+mode}).files[0];
    assert.equal(file.code,source);
    assert.deepEqual(file.metrics,{literals:0,objects:0,properties:0,bindings:0});
    assert.equal(warningColumn(file.code),warningColumn(source));
  });
}
