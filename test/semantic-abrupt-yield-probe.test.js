'use strict';

const assert=require('node:assert/strict');
const {test}=require('node:test');
const vm=require('node:vm');
const {obfuscateFiles}=require('../src');
const {snapshotDataGraph,captureDataCompletion}=require('../sims/semantic-data-oracle');

/** @param {string} code */
function execute(code) {
  const context=vm.createContext({module:{exports:null}});
  const realm=/** @type {import('../sims/semantic-data-oracle').DataRealm} */(
    vm.runInContext('({objectPrototype:Object.prototype,arrayPrototype:Array.prototype})',context));
  return captureDataCompletion(()=>{
    vm.runInContext(code,context,{filename:'abrupt.cjs',timeout:2000});
    return context.module.exports;
  },realm);
}

/** @type {Array<{label:string,body:string,kind:'return'|'throw'}>} */
const cases=[
  {label:'return-direct',body:'module.exports=owner.privateAlpha;',kind:'return'},
  {label:'throw-direct',body:'throw owner.privateAlpha;',kind:'throw'},
  {label:'throw-local-alias',body:'const extracted=owner.privateAlpha;throw extracted;',kind:'throw'},
  {label:'throw-direct-helper',body:'function privateGet(){return owner.privateAlpha;}throw privateGet();',kind:'throw'},
  {label:'throw-private-helper',body:'function privateThrow(){throw owner.privateAlpha;}privateThrow();',kind:'throw'},
  {label:'throw-local-arrow',body:'const privateThrow=()=>{throw owner.privateAlpha;};privateThrow();',kind:'throw'},
  {label:'throw-local-destructure',body:'const {privateAlpha:extracted}=owner;throw extracted;',kind:'throw'},
  {label:'throw-after-read',body:'const extracted=owner.privateAlpha;module.exports=owner.privateBeta;throw extracted;',kind:'throw'},
  {label:'caught-direct',body:'try{throw owner.privateAlpha;}catch(value){module.exports=value;}',kind:'return'},
  {label:'caught-helper',body:'function privateThrow(){throw owner.privateAlpha;}try{privateThrow();}catch(value){module.exports=value;}',kind:'return'}
];

/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];

test('exact abrupt values and transform yield per source shape, without false-safe assertions',()=>{
  /** @type {Array<{label:string,mode:string,rewritten:number,kind:string}>} */
  const rows=[];
  for(const candidate of cases) {
    const source="'use strict';const owner={privateAlpha:-0,privateBeta:7};"+candidate.body;
    const expected={kind:candidate.kind,value:snapshotDataGraph(-0)};
    assert.deepEqual(execute(source),expected,candidate.label+': native expected completion');
    for(const mode of modes) {
      const output=obfuscateFiles([{path:'abrupt.cjs',sourceType:'commonjs',code:source}],{
        mode,properties:true,strings:false,identifiers:false,
        seed:'abrupt-rewrite-eligibility/'+candidate.label+'/'+mode
      }).files[0];
      assert.equal(typeof output.code,'string');
      assert.deepEqual(execute(/** @type {string} */(output.code)),expected,
        candidate.label+'/'+mode+': exact emitted completion');
      rows.push({label:candidate.label,mode,rewritten:output.metrics.properties,kind:candidate.kind});
    }
  }
  // This suite is an inventory of native/compiled semantic agreement AND
  // protection coverage. A refusal does not count as protected behavior.
  assert.ok(rows.some(row=>row.label==='return-direct'&&row.rewritten>0),
    'the control must exercise a real property rewrite');
  process.stdout.write('ABRUPT_REWRITE_YIELD '+JSON.stringify(rows)+'\n');
});
