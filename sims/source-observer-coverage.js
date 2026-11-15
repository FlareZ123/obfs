'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/** @typedef {{path:string,sourceType:'module',code:string}} ModuleFile */
/** @typedef {{localProperties:number,crossProperties:number,totalProperties:number}} Coverage */

/** @param {ModuleFile[]} files @returns {Promise<string>} */
async function runNativeEsm(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'obfs-observer-coverage-'));
  try {
    for (const file of files) {
      await atomicWrite(path.join(root, file.path), file.code);
    }
    const child = spawnSync(process.execPath, [path.join(root, 'entry.mjs')], {
      encoding: 'utf8',
      timeout: 10000
    });
    if (child.error) throw child.error;
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  } finally {
    await fs.rm(root, {recursive:true, force:true});
  }
}

/** @param {ReturnType<typeof obfuscateFiles>} output @returns {Coverage} */
function coverage(output) {
  const localProperties = output.files.reduce((sum, file) => sum + file.metrics.properties, 0);
  const crossProperties = output.crossFile.properties;
  return {localProperties, crossProperties,
    totalProperties: localProperties + crossProperties};
}

/**
 * Compare a normal module graph, the same graph with an exported function's
 * native source observed, and a hand-segregated independent module. The final
 * case is a fixture-specific upper bound on recoverable transformation
 * coverage, NOT a proposed general automatic compiler proof.
 *
 * @param {string} seed
 * @returns {Promise<{normal:Coverage,observed:Coverage,isolated:Coverage,
 *   nativeBehaviorPreserved:boolean}>}
 */
async function studySourceObserverCoverage(seed = 'source-observer-coverage') {
  /** @type {ModuleFile} */
  const state = {path:'state.mjs', sourceType:'module',
    code:'export function watched(){const record={privateA:17};return record.privateA;}'};
  /** @type {ModuleFile} */
  const independent = {path:'independent.mjs', sourceType:'module',
    code:'export function unrelated(){const record={privateB:23};return record.privateB;}'};
  /** @type {ModuleFile} */
  const withoutObserver = {path:'entry.mjs', sourceType:'module',
    code:'import {watched} from "./state.mjs";' +
      'import {unrelated} from "./independent.mjs";' +
      'console.log(JSON.stringify({first:watched(),second:unrelated()}));'};
  /** @type {ModuleFile} */
  const withObserver = {path:'entry.mjs', sourceType:'module',
    code:'import {watched} from "./state.mjs";' +
      'import {unrelated} from "./independent.mjs";' +
      'console.log(JSON.stringify({source:watched.toString(),second:unrelated()}));'};
  const options = {
    mode: /** @type {'coo'} */ ('coo'),
    seed, closedWorld:true, strings:false, identifiers:false
  };
  const normalInput = [state, independent, withoutObserver];
  const observedInput = [state, independent, withObserver];
  const normal = obfuscateFiles(normalInput, options);
  const observed = obfuscateFiles(observedInput, options);
  const independentOnly = obfuscateFiles([independent], {...options, closedWorld:false});
  /** @type {ModuleFile[]} */
  const isolatedInput = [state, {
    ...independent, code:/** @type {string} */ (independentOnly.files[0].code)
  }, withObserver];

  assert.equal(await runNativeEsm(/** @type {ModuleFile[]} */ (normal.files)),
    await runNativeEsm(normalInput), 'Unobserved graph changed semantics');
  const reference = await runNativeEsm(observedInput);
  assert.equal(await runNativeEsm(/** @type {ModuleFile[]} */ (observed.files)),
    reference, 'Observed graph changed native function source');
  assert.equal(await runNativeEsm(isolatedInput), reference,
    'Fixture-specific isolated transform changed native output');
  return {
    normal: coverage(normal),
    observed: coverage(observed),
    isolated: coverage(independentOnly),
    nativeBehaviorPreserved: true
  };
}

if (require.main === module) {
  studySourceObserverCoverage().then(result=>{
    console.log(JSON.stringify(result, null, 2));
  }).catch(error=>{
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {studySourceObserverCoverage};
