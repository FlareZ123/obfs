'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

/**
 * Independent source-only attacker stage. This module does not import the
 * compiler, its AST or its transformation seeds. It receives a single
 * emitted public asset on stdin and decodes the nested CSS source map.
 *
 * @param {Buffer|string} distributedAsset
 * @returns {string}
 */
function extractOriginal(distributedAsset) {
  const source=String(distributedAsset);
  const embedded=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(source);
  assert.ok(embedded,'Expected an embedded CSS data URL in public asset');
  const css=Buffer.from(embedded[1],'base64').toString('utf8');
  const mapData=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(css);
  assert.ok(mapData,'Expected a nested CSS sourceMappingURL');
  const map=JSON.parse(Buffer.from(mapData[1],'base64').toString('utf8'));
  assert.equal(map.version,3);
  assert.ok(Array.isArray(map.sourcesContent));
  assert.equal(typeof map.sourcesContent[0],'string');
  return map.sourcesContent[0];
}

if(require.main===module) {
  process.stdout.write(extractOriginal(fs.readFileSync(0)));
}

module.exports={extractOriginal};
