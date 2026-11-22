'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');

/**
 * Native node:assert prints callable .name in AssertionError.message even
 * when the program never spells .name, .stack, or .toString.
 * @param {string} source
 * @returns {string}
 */
function execute(source) {
  const context={module:{exports:null},require};
  vm.runInNewContext(source,context,{timeout:2500});
  return String(context.module.exports);
}

/** @type {{name:string,source:string}[]} */
const cases=[
  {
    name:'direct strictEqual error formatter',
    source:"'use strict';const checking=require('node:assert/strict');"+
      "function originalFunctionName(){return 7;}"+
      "try{checking.strictEqual(originalFunctionName,23);}"+
      "catch(error){module.exports=error.message;}"
  },
  {
    name:'destructured strictEqual error formatter',
    source:"'use strict';const {strictEqual:check}=require('node:assert/strict');"+
      "function originalFunctionName(){return 7;}"+
      "try{check(originalFunctionName,23);}"+
      "catch(error){module.exports=error.message;}"
  },
  {
    name:'nested deepStrictEqual error formatter',
    source:"'use strict';const checking=require('node:assert/strict');"+
      "function originalFunctionName(){return 7;}"+
      "try{checking.deepStrictEqual({nested:originalFunctionName},{nested:23});}"+
      "catch(error){module.exports=error.message;}"
  }
];

for(const mode of /** @type {const} */(['sno','coo','sco'])) {
  for(const entry of cases) {
    test(mode+' Node assert preserves function name: '+entry.name,()=>{
      const emitted=obfuscateFiles([
        {path:'entry.cjs',sourceType:'commonjs',code:entry.source}
      ],{
        mode,seed:'native-assert-callable-source/'+mode+'/'+entry.name,
        strings:false,properties:false,identifiers:true
      }).files[0];
      assert.equal(execute(String(emitted.code)),execute(entry.source),
        'Native assertion formatting exposed the renamed callable');
    });
  }
  test(mode+' unrelated private binding remains renameable',()=>{
    const source="'use strict';const arithmeticOnly=27;"+
      "module.exports=arithmeticOnly*2;";
    const emitted=obfuscateFiles([
      {path:'safe.cjs',sourceType:'commonjs',code:source}
    ],{mode,seed:'native-assert-positive/'+mode,
      strings:false,properties:false,identifiers:true}).files[0];
    assert.equal(execute(String(emitted.code)),execute(source));
    assert.ok(emitted.metrics.bindings>0);
  });
}
