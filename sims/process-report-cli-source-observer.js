'use strict';

const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {atomicWrite}=require('../src/atomic');

/**
 * Run one CommonJS source under Node's externally supplied uncaught-exception
 * diagnostic-report flag.
 * @param {string} code
 * @param {string} label
 * @returns {Promise<{label:string,status:number|null,message:string,frame:string,line:number,column:number}>}
 */
async function runReportedVariant(code,label) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-process-report-'));
  const entry=path.join(directory,'entry.cjs');
  const report=path.join(directory,'report.json');
  try {
    await atomicWrite(entry,code);
    const child=spawnSync(process.execPath,[
      '--report-uncaught-exception',
      '--report-filename=report.json',
      `--report-directory=${directory}`,
      entry
    ],{encoding:'utf8'});
    const data=JSON.parse(await fs.readFile(report,'utf8'));
    const stack=/** @type {{message:string,stack:string[]}} */ (data.javascriptStack);
    const frame=stack.stack.find(value=>/entry\.cjs:\d+:\d+/.test(value));
    if(frame===undefined)throw new Error('Diagnostic report omitted the entry source frame');
    const match=/entry\.cjs:(\d+):(\d+)/.exec(frame);
    if(match===null)throw new Error('Diagnostic report entry frame has no source coordinates');
    return {
      label,
      status:child.status,
      message:stack.message,
      frame,
      line:Number(match[1]),
      column:Number(match[2])
    };
  } finally {
    await fs.rm(directory,{recursive:true,force:true});
  }
}

/**
 * Demonstrate that an external Node diagnostic-report flag can observe a
 * length-changing source rewrite even when the program never references
 * process.report.
 * @returns {Promise<{
 *   node:string,
 *   native:{label:string,status:number|null,message:string,frame:string,line:number,column:number},
 *   shortened:{label:string,status:number|null,message:string,frame:string,line:number,column:number},
 *   coordinatesEqual:boolean
 * }>}
 */
async function runExperiment() {
  const field='distinctivelyLongPrivateFieldThatForcesCoordinateShift';
  const source="'use strict';const owner={"+field+":73};"+
    "const value=owner."+field+";throw new Error(String(value));";
  const shortened=source.replaceAll(field,'x');
  const native=await runReportedVariant(source,'native');
  const rewritten=await runReportedVariant(shortened,'shortened');
  return {
    node:process.version,
    native,
    shortened:rewritten,
    coordinatesEqual:native.line===rewritten.line&&native.column===rewritten.column
  };
}

if(require.main===module) {
  runExperiment().then(result=>{
    console.log('PROCESS_REPORT_CLI_SOURCE_OBSERVER '+JSON.stringify(result));
  });
}

module.exports={runExperiment};
