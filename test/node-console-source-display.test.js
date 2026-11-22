'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/**
 * Use actual Node console rendering in fresh processes, including both
 * stdout and stderr. A fake logger would miss native util.inspect behavior.
 *
 * @param {string} code
 * @returns {{status:number|null,stdout:string,stderr:string}}
 */
function runNative(code) {
  const result=spawnSync(process.execPath,['--eval',code],{
    encoding:'utf8',timeout:10000,maxBuffer:1024*1024,windowsHide:true
  });
  if(result.error)throw result.error;
  return {status:result.status,stdout:result.stdout,stderr:result.stderr};
}

const fn="function exactNativeCallableName(){return 'source-visible-private-literal';}";

/** @type {readonly [string,string][]} */
const fixtures=[
  ['table nested function',
    fn+'console.table([{entry:exactNativeCallableName}]);'],
  ['assert formatted function',
    fn+'console.assert(false,{entry:exactNativeCallableName});'],
  ['dirxml nested function',
    fn+'console.dirxml({entry:exactNativeCallableName});'],
  ['group function label',
    fn+'console.group({entry:exactNativeCallableName});console.groupEnd();'],
  ['groupCollapsed function label',
    fn+'console.groupCollapsed({entry:exactNativeCallableName});console.groupEnd();'],
  ['count stringifies function',
    fn+'console.count(exactNativeCallableName);'],
  ['detached table function',
    fn+'const {table:show}=console;show([{entry:exactNativeCallableName}]);'],
  ['console alias group label',
    fn+'const output=console;output.group({entry:exactNativeCallableName});output.groupEnd();']
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const [label,code] of fixtures) {
    test(mode+' preserves native console source: '+label,()=>{
      const source="'use strict';"+code;
      assert.equal(observesFunctionSource(parse(source,'commonjs')),true,
        'Native console method can display exact callable source');
      const emitted=obfuscateFiles([{
        path:'entry.cjs',sourceType:'commonjs',code:source
      }],{mode,seed:'console-source-native/'+mode+'/'+label,
        strings:true,identifiers:true,properties:false}).files[0];
      const native=runNative(source);
      assert.equal(native.status,0,native.stderr);
      assert.deepEqual(runNative(String(emitted.code)),native);
      assert.equal(emitted.metrics.literals,0);
      assert.equal(emitted.metrics.bindings,0);
    });
  }
}

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  test(mode+' retains private-field rewrite under primitive console.table',()=>{
    const source="'use strict';const owner={privateLabel:53};"+
      "console.table([{entry:42}]);console.log(owner.privateLabel);";
    assert.equal(observesFunctionSource(parse(source,'commonjs')),false);
    const emitted=obfuscateFiles([{
      path:'positive.cjs',sourceType:'commonjs',code:source
    }],{mode,seed:'console-source-positive/'+mode,
      strings:false,identifiers:false,properties:true}).files[0];
    assert.deepEqual(runNative(String(emitted.code)),runNative(source));
    assert.ok(emitted.metrics.objects>0,'Safe private property should still rename');
  });
}
