'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');

/**
 * Public asset bytes are this extractor's only input. The tool never loads
 * the obfuscator, its seed, source checkout or source map sidecar.
 * @param {Buffer|string} publicAsset
 * @returns {string}
 */
function recover(publicAsset){
  const text=String(publicAsset);
  const url=/data:text\/css;base64,([A-Za-z0-9+/=]+)/iu.exec(text);
  assert.ok(url,'Published stylesheet has no nested data URL');
  const nested=Buffer.from(url[1],'base64').toString('utf8');
  const annotation=/sourceMappingURL=data:application\/json;base64,([A-Za-z0-9+/=]+)/u.exec(nested);
  assert.ok(annotation,'Nested stylesheet has no source map');
  const map=JSON.parse(Buffer.from(annotation[1],'base64').toString('utf8'));
  assert.equal(map.version,3);
  assert.ok(Array.isArray(map.sourcesContent));
  assert.equal(typeof map.sourcesContent[0],'string');
  return map.sourcesContent[0];
}

if(require.main===module)process.stdout.write(recover(fs.readFileSync(0)));
module.exports={recover};
