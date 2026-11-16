'use strict';

const assert=require('node:assert/strict');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');

const safe=[
  'module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'const read=x=>x.privateCash;module.exports=n=>read(left)+right.hiddenFee+n;',
  'function read(x){return x.privateCash;}module.exports=n=>read(left)+right.hiddenFee+n;',
  'const id=x=>x;const third=id(left);module.exports=n=>third.privateCash+right.hiddenFee+n;',
  'const read=x=>{return x.privateCash;};module.exports=n=>read(right)+left.hiddenFee+n;',
  'const extra=holder[0];module.exports=n=>extra.privateCash+right.hiddenFee+n;',
  'const get=()=>left;const next=get();module.exports=n=>next.privateCash+right.hiddenFee+n;',
  'module.exports=n=>left["privateCash"]+right.hiddenFee+n;'
];
const unsafe=[
  'holder[0]=vault;module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'const escaped=holder;module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'Reflect.get(holder,"0");module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'const index=0;const third=holder[index];module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'module.exports=n=>holder[0].privateCash+right.hiddenFee+n;',
  'Object.freeze(holder);module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'module.exports=n=>Object.keys(left).length+right.hiddenFee+n;',
  'module.exports=n=>left[n?"privateCash":"hiddenFee"]+right.hiddenFee+n;',
  'holder.push(vault);module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'const [third]=holder;module.exports=n=>left.privateCash+right.hiddenFee+n;',
  'const third=holder?.[0];module.exports=n=>left.privateCash+right.hiddenFee+n;'
];

/**
 * @param {string} code
 * @returns {(n:number)=>number}
 */
function execute(code){
  const entry=new Module('array-owner-grid.cjs');
  entry.filename='array-owner-grid.cjs';
  entry.paths=Module._nodeModulePaths(process.cwd());
  entry._compile(code,entry.filename);
  return /** @type {(n:number)=>number} */(entry.exports);
}

/**
 * Validate an indexed private owner against an explicit positive/negative
 * grammar and multiple entropy seeds. Expected rename counts enforce
 * conservative escape behavior; the actual function is checked separately.
 *
 * @returns {{programs:number,compilations:number,comparisons:number,negative:number}}
 */
function runGrid(){
  let programs=0,compilations=0,comparisons=0,negative=0;
  for(const [label,fixtures,shouldRename] of [
    ['safe',safe,true],['unsafe',unsafe,false]
  ]){
    for(let caseIndex=0;caseIndex<fixtures.length;caseIndex++){
      const head='const vault={privateCash:17,hiddenFee:6};'+
        'const holder=[vault];const left=holder[0];const right=holder[0];';
      const code=head+fixtures[caseIndex];
      const native=execute(code);
      programs++;
      if(!shouldRename)negative++;
      for(const mode of /** @type {('coo'|'sno')[]} */(['coo','sno'])){
        for(let seed=0;seed<4;seed++){
          const emitted=obfuscateFiles([{
            path:'array-grid.cjs',sourceType:'commonjs',code
          }],{
            mode,seed:'array-owner-grid/'+caseIndex+'/'+seed,
            properties:true,identifiers:false,strings:false
          }).files[0];
          const labelPrefix=label+'/'+caseIndex+'/'+mode+'/'+seed;
          assert.equal(emitted.metrics.objects,shouldRename?1:0,labelPrefix);
          assert.equal(emitted.metrics.properties,shouldRename?2:0,labelPrefix);
          const output=String(emitted.code);
          if(shouldRename)assert.doesNotMatch(output,/privateCash|hiddenFee/u);
          else assert.equal(output,code,'Refused source must remain exact: '+labelPrefix);
          const rewritten=execute(output);
          for(let input=-25;input<=25;input++){
            assert.equal(rewritten(input),native(input),labelPrefix+' at '+input);
            comparisons++;
          }
          compilations++;
        }
      }
    }
  }
  return {programs,compilations,comparisons,negative};
}

if(require.main===module){
  process.stdout.write(JSON.stringify(runGrid())+'\n');
}

module.exports={runGrid};
