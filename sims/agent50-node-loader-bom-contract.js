'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'obfs-node-loader-bom-'));

/** @param {string} extension @param {boolean} withBom @returns {string} */
function writeFixture(extension, withBom) {
  const filename = path.join(directory, (withBom ? 'bom' : 'plain') + extension);
  const code = extension === '.mjs'
    ? 'export function f(){ throw new Error("x"); }\ntry { f(); } catch(e) { console.log(e.stack.split("\\n")[1]); }\n'
    : 'function f(){ throw new Error("x"); }\ntry { f(); } catch(e) { console.log(e.stack.split("\\n")[1]); }\n';
  const prefix = withBom ? Buffer.from([0xef, 0xbb, 0xbf]) : Buffer.alloc(0);
  fs.writeFileSync(filename, Buffer.concat([prefix, Buffer.from(code, 'utf8')]));
  return filename;
}

/** @param {string} filename @param {string[]} extraArgs @returns {{stdout:string,stderr:string,code:number|null}} */
function runNode(filename, extraArgs = []) {
  const result = spawnSync(process.execPath, [...extraArgs, filename], {encoding: 'utf8'});
  if (result.error) throw result.error;
  return {stdout: result.stdout, stderr: result.stderr, code: result.status};
}

/** @param {string} output @returns {number} */
function firstFrameColumn(output) {
  const frame = output.split('\n').find(line => line.includes('at f '));
  if (!frame) throw new Error('Missing function frame: ' + output);
  const match = frame.match(/:(\d+):(\d+)\)?$/);
  if (!match) throw new Error('Missing stack column: ' + frame);
  return Number(match[2]);
}

try {
  const plainCjs = writeFixture('.cjs', false);
  const bomCjs = writeFixture('.cjs', true);
  const plainEsm = writeFixture('.mjs', false);
  const bomEsm = writeFixture('.mjs', true);

  const cjsPlain = runNode(plainCjs);
  const cjsBom = runNode(bomCjs);
  const esmPlain = runNode(plainEsm);
  const esmBom = runNode(bomEsm);
  const cjsPlainColumn = firstFrameColumn(cjsPlain.stdout);
  const cjsBomColumn = firstFrameColumn(cjsBom.stdout);
  const esmPlainColumn = firstFrameColumn(esmPlain.stdout);
  const esmBomColumn = firstFrameColumn(esmBom.stdout);

  assert.equal(cjsBomColumn, cjsPlainColumn + 1);
  assert.equal(esmBomColumn, esmPlainColumn);

  const preload = path.join(directory, 'capture-cjs.cjs');
  fs.writeFileSync(preload, `const Module=require('node:module');\nconst original=Module.prototype._compile;\nModule.prototype._compile=function(content,filename){if(filename.endsWith('bom.cjs'))process.stderr.write('CJS_COMPILE_FIRST='+content.codePointAt(0).toString(16)+'\\n');return original.call(this,content,filename);};\n`);
  const cjsCapture = runNode(bomCjs, ['-r', preload]);
  assert.ok(cjsCapture.stderr.includes('CJS_COMPILE_FIRST=feff'));

  const loader = path.join(directory, 'capture-esm.mjs');
  fs.writeFileSync(loader, `export async function load(url, context, nextLoad) {\n const result = await nextLoad(url, context);\n if (url.endsWith('bom.mjs')) {\n  const value = typeof result.source === 'string' ? result.source : new TextDecoder('utf-8',{ignoreBOM:true}).decode(result.source);\n  console.error('ESM_LOAD_FIRST=' + value.codePointAt(0).toString(16));\n }\n return result;\n}\n`);
  const esmCapture = runNode(bomEsm, ['--loader', loader]);
  assert.ok(esmCapture.stderr.includes('ESM_LOAD_FIRST=feff'));

  console.log(JSON.stringify({
    node: process.versions.node,
    cjs: {plainColumn: cjsPlainColumn, bomColumn: cjsBomColumn, compileInputFirstCodePoint: 'feff'},
    esm: {plainColumn: esmPlainColumn, bomColumn: esmBomColumn, loaderSourceFirstCodePoint: 'feff'},
    conclusion: 'Both loader paths expose the BOM in their source input, but Node 22.16.0 stack coordinates count it for CJS and exclude it for ESM.'
  }, null, 2));
} finally {
  fs.rmSync(directory, {recursive: true, force: true});
}
