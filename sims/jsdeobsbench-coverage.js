'use strict';

const fs=require('node:fs/promises');

/**
 * @typedef {{files:number,sourceBytes:number,obfuscatedBytes:number,
 *  sizeRatio:number,withPropertyRewrites:number,withBindingRewrites:number,
 *  withEncodedLiterals:number,properties:number,bindings:number,literals:number,
 *  objects:number}} Coverage
 */

/**
 * Aggregate observable compiler transformation metrics from the generated
 * independent-source benchmark. A positive metric is not evidence of attack
 * resistance; a zero metric often indicates a conservative safety refusal.
 *
 * @param {string} jsonl
 * @returns {Promise<Coverage>}
 */
async function summarizeCoverage(jsonl) {
  const rows=(await fs.readFile(jsonl,'utf8')).split(/\r?\n/u).filter(Boolean);
  const summary={
    files:0,sourceBytes:0,obfuscatedBytes:0,sizeRatio:0,
    withPropertyRewrites:0,withBindingRewrites:0,withEncodedLiterals:0,
    properties:0,bindings:0,literals:0,objects:0
  };
  for(const line of rows) {
    const row=JSON.parse(line);
    if(!row||typeof row.original!=='string'||typeof row.obfuscated!=='string'||
        !row.obfs_metrics||typeof row.obfs_metrics!=='object') {
      throw new TypeError('Missing original, obfuscated or transformation metrics');
    }
    const metrics=row.obfs_metrics;
    /** @type {('properties'|'bindings'|'literals'|'objects')[]} */
    const metricNames=['properties','bindings','literals','objects'];
    for(const name of metricNames) {
      if(!Number.isSafeInteger(metrics[name])||metrics[name]<0) {
        throw new TypeError('Invalid compiler metric '+name);
      }
      summary[name]+=metrics[name];
    }
    summary.files++;
    summary.sourceBytes+=Buffer.byteLength(row.original);
    summary.obfuscatedBytes+=Buffer.byteLength(row.obfuscated);
    if(metrics.properties>0)summary.withPropertyRewrites++;
    if(metrics.bindings>0)summary.withBindingRewrites++;
    if(metrics.literals>0)summary.withEncodedLiterals++;
  }
  if(!summary.files)throw new Error('Empty transformed benchmark');
  summary.sizeRatio=summary.sourceBytes>0?summary.obfuscatedBytes/summary.sourceBytes:0;
  return summary;
}

if(require.main===module) {
  if(process.argv.length!==3)throw new TypeError('Required: generated benchmark JSONL path');
  summarizeCoverage(process.argv[2]).then(result=>{
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={summarizeCoverage};
