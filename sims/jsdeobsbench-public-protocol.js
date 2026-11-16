'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {atomicWrite}=require('../src/atomic');

/**
 * @typedef {{filename:string,original:string,test_cases:unknown[],obfuscated:string,
 *  obfs_source_type:'script'|'commonjs',obfs_output_sha256:string,
 *  obfs_metrics:{literals:number},[key:string]:unknown}} CompiledRow
 * @typedef {{filename:string,obfuscated:string,obfs_source_type:'script'|'commonjs',
 *  obfs_output_sha256:string}} PublicRow
 * @typedef {PublicRow & {attack_input_sha256:string,attack_recovered_literals:number,
 *  attack_recovered_tables:number}} RecoveredRow
 */

/** @param {string} source @returns {string} */
function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

/**
 * @param {string} filename
 * @returns {Promise<Record<string,unknown>[]>}
 */
async function readJsonl(filename) {
  const text=await fs.readFile(filename,'utf8');
  return text.split(/\r?\n/u).filter(Boolean).map(line=>{
    const row=JSON.parse(line);
    if(!row||typeof row!=='object'||Array.isArray(row))throw new TypeError('Invalid dataset row');
    return /** @type {Record<string,unknown>} */ (row);
  });
}

/** @param {string} input @param {string} output */
function disjoint(input,output) {
  if(path.resolve(input)===path.resolve(output))throw new TypeError('Input and output must differ');
}

/**
 * Erase original programs, official test cases, random seeds and compiler
 * metrics before supplying a source-only attacker with its own input file.
 * @param {string} compiledFile
 * @param {string} publicFile
 * @returns {Promise<number>}
 */
async function publishPublicCorpus(compiledFile,publicFile) {
  disjoint(compiledFile,publicFile);
  const rows=await readJsonl(compiledFile);
  if(!rows.length)throw new TypeError('Empty compiled benchmark');
  /** @type {PublicRow[]} */
  const output=[];
  const seen=new Set();
  for(const row of rows) {
    if(typeof row.filename!=='string'||!row.filename||seen.has(row.filename)||
       typeof row.obfuscated!=='string'||typeof row.obfs_output_sha256!=='string'||
       !['script','commonjs'].includes(/** @type {string} */ (row.obfs_source_type))||
       sha256(row.obfuscated)!==row.obfs_output_sha256)throw new TypeError('Invalid compiled identity or content');
    seen.add(row.filename);
    output.push({filename:row.filename,obfuscated:row.obfuscated,
      obfs_source_type:/** @type {'script'|'commonjs'} */(row.obfs_source_type),
      obfs_output_sha256:row.obfs_output_sha256});
  }
  await atomicWrite(publicFile,output.map(row=>JSON.stringify(row)).join('\n')+'\n');
  return output.length;
}

/**
 * Join recovered public-only source to held-back originals for independent
 * sandboxed differential testing. This stage is outside the attacker input
 * process and fails when any committed literal remains unrecovered.
 * @param {string} compiledFile
 * @param {string} recoveredFile
 * @param {string} verifiedFile
 * @returns {Promise<{programs:number,encodedLiterals:number,recoveredLiterals:number}>}
 */
async function verifyRecoveredCorpus(compiledFile,recoveredFile,verifiedFile) {
  disjoint(compiledFile,verifiedFile);
  disjoint(recoveredFile,verifiedFile);
  const compiled=await readJsonl(compiledFile);
  const recovered=await readJsonl(recoveredFile);
  if(!compiled.length||compiled.length!==recovered.length)throw new TypeError('Benchmark row-count mismatch');
  /** @type {Map<string,RecoveredRow>} */
  const byFilename=new Map();
  for(const item of recovered) {
    if(typeof item.filename!=='string'||!item.filename||byFilename.has(item.filename)||
       typeof item.obfuscated!=='string'||typeof item.attack_input_sha256!=='string'||
       typeof item.obfs_output_sha256!=='string'||
       typeof item.attack_recovered_literals!=='number'||
       !Number.isSafeInteger(item.attack_recovered_literals)||item.attack_recovered_literals<0||
       typeof item.attack_recovered_tables!=='number'||
       !Number.isSafeInteger(item.attack_recovered_tables)||item.attack_recovered_tables<0||
       sha256(item.obfuscated)!==item.obfs_output_sha256) {
      throw new TypeError('Invalid or duplicate recovered public row');
    }
    byFilename.set(item.filename,/** @type {RecoveredRow} */(/** @type {unknown} */(item)));
  }
  const summary={programs:0,encodedLiterals:0,recoveredLiterals:0};
  /** @type {string[]} */
  const rows=[];
  for(const item of compiled) {
    if(typeof item.filename!=='string'||typeof item.obfuscated!=='string'||
       typeof item.obfs_output_sha256!=='string'||
       !item.obfs_metrics||typeof item.obfs_metrics!=='object'||
       !Number.isSafeInteger(/** @type {Record<string,unknown>} */(item.obfs_metrics).literals)) {
      throw new TypeError('Invalid private benchmark row');
    }
    const native=/** @type {CompiledRow} */(/** @type {unknown} */(item));
    const publicRow=byFilename.get(native.filename);
    if(!publicRow||publicRow.attack_input_sha256!==native.obfs_output_sha256||
       publicRow.obfs_source_type!==native.obfs_source_type||
       publicRow.attack_recovered_literals!==native.obfs_metrics.literals) {
      throw new Error('Incomplete or inauthentic public recovery for '+native.filename);
    }
    summary.programs++;
    summary.encodedLiterals+=native.obfs_metrics.literals;
    summary.recoveredLiterals+=publicRow.attack_recovered_literals;
    rows.push(JSON.stringify({...native,
      obfuscated:publicRow.obfuscated,
      obfs_output_sha256:publicRow.obfs_output_sha256,
      attack_input_sha256:publicRow.attack_input_sha256,
      attack_recovered_literals:publicRow.attack_recovered_literals,
      attack_recovered_tables:publicRow.attack_recovered_tables}));
  }
  if(summary.encodedLiterals===0)throw new Error('Benchmark exercised no encoded literals');
  await atomicWrite(verifiedFile,rows.join('\n')+'\n');
  return summary;
}

/**
 * Assemble a minimal source-only attacker root without any benchmark
 * originals, compiler metrics, tests, or transforming compiler modules.
 * Every staged file is an atomic, locked copy; the output directory must be
 * new to prevent stale or accidentally exposed files.
 *
 * @param {string} publicFile
 * @param {string} stageDirectory
 * @returns {Promise<{files:number,bytes:number}>}
 */
async function stagePublicAttacker(publicFile,stageDirectory) {
  const root=path.resolve(stageDirectory);
  if(path.resolve(publicFile)===path.join(root,'public.jsonl')) {
    throw new TypeError('Public input cannot already be inside the new stage');
  }
  const published=await fs.readFile(publicFile);
  if(!published.length)throw new TypeError('Empty published source');
  await fs.mkdir(root);
  const inputFiles=[
    [path.join(__dirname,'jsdeobsbench-public-static-attack.js'),
      'sims/jsdeobsbench-public-static-attack.js'],
    [path.join(__dirname,'../src/atomic.js'),'src/atomic.js'],
    [require.resolve('acorn/package.json'),'node_modules/acorn/package.json'],
    [require.resolve('acorn'),'node_modules/acorn/dist/acorn.js']
  ];
  let bytes=0;
  for(const [input,relative] of inputFiles) {
    const contents=await fs.readFile(input);
    await atomicWrite(path.join(root,relative),contents);
    bytes+=contents.length;
  }
  await atomicWrite(path.join(root,'public.jsonl'),published);
  return {files:inputFiles.length+1,bytes:bytes+published.length};
}

if(require.main===module) {
  const args=process.argv.slice(2);
  const mode=args[0];
  const task=mode==='--publish'&&args.length===3 ?
    publishPublicCorpus(args[1],args[2]) :
    mode==='--verify'&&args.length===4 ?
      verifyRecoveredCorpus(args[1],args[2],args[3]) :
    mode==='--stage'&&args.length===3 ?
      stagePublicAttacker(args[1],args[2]) :
      Promise.reject(new TypeError('Expected --publish COMPILED PUBLIC, --stage PUBLIC DIRECTORY, or --verify COMPILED RECOVERED VERIFIED'));
  task.then(result=>{
    process.stdout.write('PUBLIC_ATTACK_PROTOCOL '+JSON.stringify(result)+'\n');
  }).catch(error=>{
    process.stderr.write(String(error?.stack??error)+'\n');
    process.exitCode=1;
  });
}

module.exports={publishPublicCorpus,verifyRecoveredCorpus,stagePublicAttacker};
