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
    vm.runInContext(code,context,{filename:'completion.cjs',timeout:2000});
    return context.module.exports;
  },realm);
}

/** @type {Array<{label:string,expression:string,expected:unknown,kind:'return'|'throw',array:boolean}>} */
const cases=[
  {label:'return-negative-zero',expression:'-0',expected:-0,kind:'return',array:false},
  {label:'throw-negative-zero',expression:'-0',expected:-0,kind:'throw',array:false},
  {label:'throw-nan',expression:'0/0',expected:NaN,kind:'throw',array:false},
  {label:'throw-undefined',expression:'void 0',expected:undefined,kind:'throw',array:false},
  {label:'throw-null',expression:'null',expected:null,kind:'throw',array:false},
  {label:'throw-bigint',expression:'9007199254740993n',expected:9007199254740993n',kind:'throw',array:false}
];
const reference={publicValue:-0,publicNaN:NaN};
cases.push({label:'throw-shared-record',expression:'{publicValue:-0,publicNaN:0/0}',
  expected:[reference,reference,7],kind:'throw',array:true});

/** @type {Array<'coo'|'sno'|'sco'>} */
const modes=['coo','sno','sco'];

test('native and emitted data completions retain exact thrown values and identity',()=>{
  /** @type {Array<{label:string,mode:string,rewritten:number}>} */
  const rows=[];
  for(const c of cases) {
    const data=c.array?'[owner.privateAlpha,owner.privateAlpha,owner.privateBeta]':'owner.privateAlpha';
    const source="'use strict';const owner={privateAlpha:"+c.expression+",privateBeta:7};"+
      (c.kind==='throw'?'throw ':'module.exports=')+data+';';
    const expected={kind:c.kind,value:snapshotDataGraph(c.expected)};
    assert.deepEqual(execute(source),expected,c.label+': independent native expectation');
    for(const mode of modes) {
      const result=obfuscateFiles([{path:'completion.cjs',sourceType:'commonjs',code:source}],{
        mode,properties:true,strings:false,identifiers:false,seed:'exact-completion/'+c.label+'/'+mode
      }).files[0];
      assert.equal(typeof result.code,'string');
      assert.deepEqual(execute(/** @type {string} */(result.code)),expected,c.label+'/'+mode+': exact completion');
      rows.push({label:c.label,mode,rewritten:result.metrics.properties});
    }
  }
  process.stdout.write('EXACT_DATA_COMPLETIONS '+JSON.stringify(rows)+'\n');
  assert.ok(rows.some(row=>row.label==='return-negative-zero'&&row.rewritten>0),
    'normal positive control must have a real property rewrite');
  assert.ok(rows.some(row=>row.label.startsWith('throw-')&&row.rewritten>0),
    'at least one abrupt completion must contain a real property rewrite');
});
