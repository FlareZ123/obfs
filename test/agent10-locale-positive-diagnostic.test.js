'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {obfuscateFiles}=require('../src');
const {parse,observesFunctionSource}=require('../src/ast');

/** @typedef {{path:string,code:string,sourceType:'module'}} Input */
/** @param {string} expression @returns {Input[]} */
function group(expression) {
  return [
    {path:'owner.mjs',sourceType:'module',code:'export const owner={secretField:7};'},
    {path:'consumer.mjs',sourceType:'module',code:[
      "import {owner} from './owner.mjs';",
      expression,
      'export const observed=owner.secretField;'
    ].join('\n')}
  ];
}
/** @type {[string,string][]} */
const cases=[
  ['no-locale','const nativeNumber=7;void nativeNumber;'],
  ['literal-local','const nativeNumber=7;void nativeNumber.toLocaleString("en-US");'],
  ['literal-direct','void (7).toLocaleString("en-US");'],
  ['literal-const-object','const nativeNumber=7;const sink=nativeNumber.toLocaleString("en-US");'],
  ['native-prototype','const source=Number.prototype.toLocaleString.call(7,"en-US");'],
  ['dead-bad-fn','const source=(()=>5).toLocaleString();']
];

test('Agent10 diagnostic: positive cross-file property rewrite is not lost without reason',()=>{
  for(const [name,expression] of cases) {
    for(const mode of /** @type {Array<'coo'|'sno'>} */ (['coo','sno'])) {
      const files=group(expression);
      const consumer=files[1];
      const observed=observesFunctionSource(parse(consumer.code,'module'));
      const out=obfuscateFiles(files,{
        mode,closedWorld:true,properties:true,identifiers:false,strings:false,
        seed:'agent10-locale/'+name+'/'+mode
      });
      const details=out.files.map(f=>({path:f.path,properties:f.metrics.properties,
        source:String(f.code).slice(0,500)}));
      const count=out.crossFile.properties+details.reduce((sum,f)=>sum+f.properties,0);
      console.log('AGENT10_LOCALE_DIAGNOSTIC '+JSON.stringify({
        name,mode,observed,crossFile:out.crossFile.properties,total:count,details
      }));
      assert.ok(out.files.length===2);
    }
  }
});
