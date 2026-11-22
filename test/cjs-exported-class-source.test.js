'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {mkdtemp, rm} = require('node:fs/promises');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {obfuscateFiles} = require('../src');
const {atomicWrite} = require('../src/atomic');

/**
 * Run the code with Node's real CommonJS loader. The independent importer is
 * deliberately absent from the compiler's source-file group.
 * @param {string} source
 * @param {string} importer
 * @returns {Promise<string>}
 */
async function loadFromOutside(source, importer) {
  const directory = await mkdtemp(path.join(tmpdir(), 'obfs-exported-class-'));
  try {
    const filename = path.join(directory, 'entry.cjs');
    await atomicWrite(filename, source);
    const child = spawnSync(process.execPath, ['-e', importer, filename], {
      encoding: 'utf8', timeout: 10000
    });
    assert.ifError(child.error);
    assert.equal(child.status, 0, child.stderr);
    return child.stdout;
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
}

/**
 * @param {string} source
 * @param {'coo'|'sno'} mode
 * @param {boolean} [symbols]
 * @returns {{code:string,renamed:number}}
 */
function compile(source, mode, symbols=false) {
  const file = obfuscateFiles([{
    path: 'entry.cjs', sourceType: 'commonjs', code: source
  }], {
    mode, seed: 'cjs-exported-class-source/' + mode,
    properties: true, identifiers: false, strings: false,
    experimentalSymbolKeys: symbols
  }).files[0];
  return {code: /** @type {string} */ (file.code), renamed: file.metrics.properties};
}

const classBody = 'const owner={privateField:7};' +
  'class Reader{value(){return owner.privateField;}}';

/** @type {Array<{name:string,assignment:string,selector:string}>} */
const externalExports = [
  {name: 'record', assignment: 'module.exports={Reader};', selector: 'entry.Reader'},
  {name: 'direct', assignment: 'module.exports=Reader;', selector: 'entry'},
  {name: 'exports binding', assignment: 'exports.Reader=Reader;', selector: 'entry.Reader'}
];

for (const mode of /** @type {Array<'coo'|'sno'>} */ (['coo', 'sno'])) {
  for (const fixture of externalExports) {
    test(mode + ' externally exported CommonJS class retains callable source: ' + fixture.name,
      async () => {
        const original = classBody + fixture.assignment;
        const transformed = compile(original, mode);
        const importer = 'const entry=require(process.argv[1]);' +
          'const C=' + fixture.selector + ';' +
          'process.stdout.write(JSON.stringify({' +
          'result:new C().value(),classSource:C.toString(),' +
          'methodSource:C.prototype.value.toString()}));';
        const native = await loadFromOutside(original, importer);
        const emitted = await loadFromOutside(transformed.code, importer);
        assert.equal(JSON.parse(native).result, 7);
        assert.equal(emitted, native,
          'External importer observed a changed method/class source: ' +
          JSON.stringify({mode, fixture: fixture.name, renamed: transformed.renamed}));
        assert.equal(transformed.renamed, 0,
          'Unknown external CommonJS consumers require source-stable callable definitions');
      }
    );
  }
  for (const fixture of [
    {name: 'instance', assignment: 'module.exports=new Reader();', selector: 'entry'},
    {name: 'instance record', assignment: 'module.exports={reader:new Reader()};', selector: 'entry.reader'}
  ]) {
    test(mode + ' exported CommonJS class instance retains constructor/method source: ' +
      fixture.name, async () => {
      const original = classBody + fixture.assignment;
      const transformed = compile(original, mode);
      const importer = 'const entry=require(process.argv[1]);' +
        'const instance=' + fixture.selector + ';' +
        'process.stdout.write(JSON.stringify({' +
        'result:instance.value(),classSource:instance.constructor.toString(),' +
        'methodSource:instance.value.toString()}));';
      const native = await loadFromOutside(original, importer);
      const emitted = await loadFromOutside(transformed.code, importer);
      assert.equal(JSON.parse(native).result, 7);
      assert.equal(emitted, native,
        'External importer observed changed class instance constructor/method source: ' +
        JSON.stringify({mode, fixture: fixture.name, renamed: transformed.renamed}));
      assert.equal(transformed.renamed, 0,
        'An exported instance exposes class source through its constructor');
    });
  }
  test(mode + ' genuinely private CommonJS class retains positive own-key renaming',
    async () => {
      const original = classBody + 'module.exports=new Reader().value();';
      const transformed = compile(original, mode);
      const importer = 'process.stdout.write(String(require(process.argv[1])));';
      assert.equal(await loadFromOutside(original, importer), '7');
      assert.equal(await loadFromOutside(transformed.code, importer), '7');
      assert.ok(transformed.renamed > 0,
        'Conservative public-callable guard should retain private positive yield');
    }
  );
}

for (const mode of /** @type {Array<'coo'|'sno'>} */ (['coo', 'sno'])) {
  for (const fixture of [
    {name: 'public constructor', assignment: 'module.exports={Reader};',
      importer: 'const C=require(process.argv[1]).Reader;' +
        'process.stdout.write(JSON.stringify({result:new C().value(),' +
        'classSource:C.toString(),methodSource:C.prototype.value.toString()}));'},
    {name: 'public instance', assignment: 'module.exports=new Reader();',
      importer: 'const x=require(process.argv[1]);' +
        'process.stdout.write(JSON.stringify({result:x.value(),' +
        'classSource:x.constructor.toString(),methodSource:x.value.toString()}));'}
  ]) {
    test(mode + ' experimental Symbol backend preserves exported class source: ' +
      fixture.name, async () => {
      const original = classBody + fixture.assignment;
      const transformed = compile(original, mode, true);
      const native = await loadFromOutside(original, fixture.importer);
      const emitted = await loadFromOutside(transformed.code, fixture.importer);
      assert.equal(JSON.parse(native).result, 7);
      assert.equal(emitted, native,
        'Symbol keys altered callable source: ' +
        JSON.stringify({mode, fixture: fixture.name, renamed: transformed.renamed}));
      assert.equal(transformed.renamed, 0,
        'Public symbol-key lowering must prove absent external source observers');
    });
  }
  test(mode + ' experimental Symbol backend keeps genuinely private class key yield',
    async () => {
      const original = classBody + 'module.exports=new Reader().value();';
      const transformed = compile(original, mode, true);
      const importer = 'process.stdout.write(String(require(process.argv[1])));';
      assert.equal(await loadFromOutside(original, importer), '7');
      assert.equal(await loadFromOutside(transformed.code, importer), '7');
      assert.ok(transformed.renamed > 0,
        'Positive Symbol backend control must lower an actual own field');
    }
  );
}
