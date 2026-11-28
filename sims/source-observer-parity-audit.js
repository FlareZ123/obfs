'use strict';
const fs=require('node:fs');

/**
 * @typedef {{mode:'coo'|'sco'|'sno',bindings:number,nativeSource:string,
 * emittedSource:string,parity:boolean}} ModeEvidence
 */
/**
 * @typedef {{name:string,nativeShared:boolean,group:boolean,local:boolean,
 * evidence:ModeEvidence[]}} CarrierFixture
 */
/**
 * @typedef {{rows:number,nativeShared:number,nativeNotShared:number,
 * safeRefusals:number,positiveRewrites:number,unsafeRewrites:string[],
 * zeroYield:string[],parityFailures:string[],modeDisagreements:string[],
 * duplicateNames:string[]}} AuditResult
 */

/**
 * Build a reproducible and explicitly finite source-parity confusion matrix
 * from the CFG_CARRIER records emitted by test/agent3-weakmap-cfg-matrix.test.js.
 *
 * This is a concrete runtime-corpus assessment, not a proof that an arbitrary
 * environment cannot observe source. Preserve original CI source SHA and
 * Node/host versions separately with each report.
 *
 * @param {string} log
 * @returns {AuditResult}
 */
function audit(log) {
  /** @type {AuditResult} */
  const result={
    rows:0,nativeShared:0,nativeNotShared:0,safeRefusals:0,
    positiveRewrites:0,unsafeRewrites:[],zeroYield:[],parityFailures:[],
    modeDisagreements:[],duplicateNames:[]
  };
  const seen=new Set();
  for(const line of log.split(/\r?\n/u)) {
    const marker='CFG_CARRIER ';
    const index=line.indexOf(marker);
    if(index<0)continue;
    /** @type {CarrierFixture} */
    const record=JSON.parse(line.slice(index+marker.length).trim());
    if(typeof record.name!=='string'||typeof record.nativeShared!=='boolean'||
       !Array.isArray(record.evidence))
      throw new Error('Malformed CFG_CARRIER record: '+line.slice(0,250));
    if(seen.has(record.name))result.duplicateNames.push(record.name);
    seen.add(record.name);
    /** @type {Map<string,ModeEvidence>} */
    const modes=new Map();
    for(const row of record.evidence)modes.set(row.mode,row);
    if(modes.size!==3||!['coo','sco','sno'].every(mode=>modes.has(mode))) {
      result.modeDisagreements.push(record.name);
      continue;
    }
    result.rows++;
    if(record.nativeShared)result.nativeShared++;
    else result.nativeNotShared++;
    const values=[...modes.values()];
    if(values.some(e=>!e.parity||e.nativeSource!==e.emittedSource))
      result.parityFailures.push(record.name);
    const bindings=values.map(e=>e.bindings);
    if(bindings.some(b=>!Number.isInteger(b)||b<0)||
       !bindings.every(b=>b===bindings[0]))
      result.modeDisagreements.push(record.name);
    const anyRewrite=bindings.some(b=>b>0);
    if(record.nativeShared) {
      if(anyRewrite)result.unsafeRewrites.push(record.name);
      else result.safeRefusals++;
    } else if(!anyRewrite)result.zeroYield.push(record.name);
    else result.positiveRewrites++;
  }
  return result;
}

if(require.main===module) {
  try {
    const filename=process.argv[2];
    if(!filename)throw new Error(
      'Usage: node sims/source-observer-parity-audit.js <saved-workflow-log.txt>');
    const result=audit(fs.readFileSync(filename,'utf8'));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
    if(result.rows===0||result.duplicateNames.length||
       result.unsafeRewrites.length||result.zeroYield.length||
       result.parityFailures.length||result.modeDisagreements.length)
      process.exitCode=1;
  } catch(error) {
    process.stderr.write(String(error.stack||error)+'\n');
    process.exitCode=1;
  }
}
module.exports={audit};
