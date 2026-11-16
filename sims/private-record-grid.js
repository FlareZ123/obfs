'use strict';

const assert=require('node:assert/strict');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('./offline-normalize');

/** @param {string} source @returns {(n:number)=>number} */
function load(source){
  const module=new Module('private-record-grid.cjs');
  module.filename='private-record-grid.cjs';
  module.paths=Module._nodeModulePaths(process.cwd());
  module._compile(source,module.filename);
  return /** @type {(n:number)=>number} */ (module.exports);
}

/**
 * @param {number} size
 * @param {number} position
 * @param {boolean} bracket
 * @returns {string}
 */
function program(size,position,bracket){
  const literals=['null','true','"metadata"','3n','0','false','"tag"'];
  const fields=Array.from({length:size},(_,index)=>
    'slot'+index+':'+(index===position?'owner':literals[(index+position)%literals.length]));
  const access=bracket?'record["slot'+position+'"]':'record.slot'+position;
  return [
    'const owner={hiddenCount:37,secretDelta:4};',
    'const record={'+fields.join(',')+'};',
    'const alias='+access+';',
    'function identity(y){return y;}',
    'const reader=x=>x.hiddenCount;',
    'module.exports=function score(n){return reader(identity(alias))*n+owner.secretDelta;}'
  ].join('\n');
}

/**
 * @returns {{programs:number,compilations:number,comparisons:number,reconstructed:number}}
 */
function runGrid(){
  const counts={programs:0,compilations:0,comparisons:0,reconstructed:0};
  for(let size=1;size<=8;size++){
    for(let position=0;position<size;position++){
      for(const bracket of [false,true]){
        const source=program(size,position,bracket);
        const expected=load(source);
        counts.programs++;
        for(const mode of ['coo','sno']){
          const result=obfuscateFiles([{
            path:'record.cjs',sourceType:'commonjs',code:source
          }],{mode,seed:'record-grid-'+size+'-'+position+'-'+bracket,
            properties:true,strings:false,identifiers:false});
          const emitted=String(result.files[0].code);
          assert.equal(result.files[0].metrics.properties,2,
            mode+' '+size+':'+position+':'+bracket);
          assert.doesNotMatch(emitted,/hiddenCount|secretDelta/u);
          const recovery=neutralizeHashedNames([{
            path:'record.cjs',sourceType:'commonjs',code:emitted
          }]);
          assert.equal(recovery.properties,2);
          counts.reconstructed++;
          const protectedFn=load(emitted);
          const copiedFn=load(String(recovery.files[0].code));
          for(let input=-80;input<=80;input++){
            const native=expected(input);
            assert.equal(protectedFn(input),native,'protected '+size+':'+position+':'+input);
            assert.equal(copiedFn(input),native,'recovered '+size+':'+position+':'+input);
            counts.comparisons++;
          }
          counts.compilations++;
        }
      }
    }
  }
  return counts;
}
if(require.main===module)process.stdout.write(
  'PRIVATE_RECORD_GRID '+JSON.stringify({node:process.version,platform:process.platform,
    ...runGrid()})+'\n');
module.exports={runGrid};
