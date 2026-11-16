'use strict';

const assert=require('node:assert/strict');
const Module=require('node:module');
const {obfuscateFiles}=require('../src');
const {neutralizeHashedNames}=require('./offline-normalize');

/** @param {string} source @returns {(value:number)=>number} */
function load(source) {
  const module=new Module('private-tuple-grid.cjs');
  module.filename='private-tuple-grid.cjs';
  module.paths=Module._nodeModulePaths(process.cwd());
  module._compile(source,module.filename);
  return /** @type {(value:number)=>number} */(module.exports);
}

/**
 * Produce independent original source for a tuple with one owner and
 * side-effect-free primitive companions. Mixed Boolean, BigInt, null and
 * string literals exercise the candidate's conservative admission rule.
 * @param {number} length
 * @param {number} ownerPosition
 * @returns {string}
 */
function source(length,ownerPosition) {
  const primitive=['null','true','false','2n','"metadata"', '0', '7'];
  const elements=Array.from({length},(_,index)=>index===ownerPosition?
    'owner':primitive[(index+ownerPosition)%primitive.length]);
  return [
    'const owner={hiddenCount:11,privateDelta:5};',
    'const tuple=['+elements.join(',')+'];',
    'const alias=tuple['+ownerPosition+'];',
    'function identity(y){return y;}',
    'const reader=x=>x.hiddenCount;',
    'module.exports=function compute(n){return reader(identity(alias))*n+owner.privateDelta;}'
  ].join('\n');
}

/**
 * Differential native/generated/recovered behavior over every fixed owner
 * position in tuple sizes 1..8, for COO and SNO.
 *
 * @returns {{programs:number,compilations:number,comparisons:number,sourceOnlyRecoveries:number}}
 */
function runGrid() {
  const report={programs:0,compilations:0,comparisons:0,sourceOnlyRecoveries:0};
  for(let length=1;length<=8;length++) {
    for(let position=0;position<length;position++) {
      report.programs++;
      const code=source(length,position);
      const baseline=load(code);
      for(const mode of ['coo','sno']) {
        const result=obfuscateFiles([{
          path:'entry.cjs',sourceType:'commonjs',code
        }],{mode,seed:'tuple-grid-'+length+'-'+position,properties:true,
          strings:false,identifiers:false});
        const generated=String(result.files[0].code);
        assert.equal(result.files[0].metrics.properties,2,mode+' '+length+':'+position);
        assert.doesNotMatch(generated,/hiddenCount|privateDelta/u);
        const extracted=neutralizeHashedNames([{
          path:'entry.cjs',sourceType:'commonjs',code:generated
        }]);
        assert.equal(extracted.properties,2);
        report.sourceOnlyRecoveries++;
        const protectedFn=load(generated);
        const copiedFn=load(String(extracted.files[0].code));
        for(let value=-80;value<=80;value++) {
          const expected=baseline(value);
          assert.equal(protectedFn(value),expected,mode+' encoded '+length+':'+position+' '+value);
          assert.equal(copiedFn(value),expected,mode+' recovered '+length+':'+position+' '+value);
          report.comparisons++;
        }
        report.compilations++;
      }
    }
  }
  return report;
}

if(require.main===module)process.stdout.write(JSON.stringify({
  node:process.version,platform:process.platform,
  ...runGrid(),
  security:'Source-only property label normalizer recovers every tested public label'
},null,2)+'\n');

module.exports={runGrid};
