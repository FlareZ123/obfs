'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const {isUtf8} = require('node:buffer');
const http = require('node:http');

/** @param {Buffer} bytes @returns {string} */
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Match the prototype's parser-input generation: parser contract plus exact
 * JavaScript UTF-16 code units, not the original file bytes.
 * @param {string} source
 * @param {string} parserContractId
 * @returns {string}
 */
function parserInputGeneration(source, parserContractId) {
  return createHash('sha256')
    .update(parserContractId, 'utf8')
    .update('\0')
    .update(source, 'utf16le')
    .digest('hex');
}

/** @param {string} value @returns {string[]} */
function codePoints(value) {
  return Array.from(value, character =>
    (character.codePointAt(0) ?? 0).toString(16));
}

const parserContractId = 'fixture-parser-contract-v1';
const malformedA = Buffer.from([0x61, 0x80, 0x62]);
const malformedB = Buffer.from([0x61, 0x81, 0x62]);
const bufferDecodedA = malformedA.toString('utf8');
const bufferDecodedB = malformedB.toString('utf8');
const textDecoderA = new TextDecoder('utf-8').decode(malformedA);
const textDecoderB = new TextDecoder('utf-8').decode(malformedB);

assert.notEqual(sha256(malformedA), sha256(malformedB));
assert.equal(bufferDecodedA, bufferDecodedB);
assert.equal(textDecoderA, textDecoderB);
assert.equal(bufferDecodedA, textDecoderA);
assert.equal(
  parserInputGeneration(bufferDecodedA, parserContractId),
  parserInputGeneration(bufferDecodedB, parserContractId)
);
assert.throws(
  () => new TextDecoder('utf-8', {fatal: true}).decode(malformedA),
  {name: 'TypeError'}
);

const bomBytes = Buffer.from([0xef, 0xbb, 0xbf, 0x61]);
const bufferBom = bomBytes.toString('utf8');
const textDecoderBom = new TextDecoder('utf-8').decode(bomBytes);
const textDecoderPreserveBom = new TextDecoder('utf-8', {ignoreBOM: true}).decode(bomBytes);
assert.equal(sha256(bomBytes), sha256(Buffer.from([0xef, 0xbb, 0xbf, 0x61])));
assert.notEqual(bufferBom, textDecoderBom);
assert.equal(bufferBom, textDecoderPreserveBom);
assert.notEqual(
  parserInputGeneration(bufferBom, parserContractId),
  parserInputGeneration(textDecoderBom, parserContractId)
);

// The current SNO CLI's admitted JavaScript input path first calls isUtf8 and
// then Buffer.toString('utf8'). Verify reversibility for every Unicode scalar
// value and for representative multi-code-point strings.
let checkedValidUnicodeScalars = 0;
for (let codePoint = 0; codePoint <= 0x10ffff; codePoint++) {
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) continue;
  const original = Buffer.from(String.fromCodePoint(codePoint), 'utf8');
  if (!isUtf8(original) || !original.equals(Buffer.from(original.toString('utf8'), 'utf8'))) {
    throw new Error('SNO strict UTF-8 round-trip failed at U+' + codePoint.toString(16));
  }
  checkedValidUnicodeScalars++;
}
const roundTripExamples = [
  bomBytes,
  Buffer.from([0x61, 0x0d, 0x0a, 0x62]),
  Buffer.from('é😀�', 'utf8')
].map(original => ({
  bytes: original.toString('hex'),
  roundTripEqual: original.equals(Buffer.from(original.toString('utf8'), 'utf8'))
}));
if (roundTripExamples.some(example => !example.roundTripEqual)) {
  throw new Error('SNO strict UTF-8 example round-trip failed');
}

const report = {
  node: process.versions.node,
  snoCliStrictUtf8RoundTrip: {
    decoder: 'isUtf8(Buffer) then Buffer.toString(utf8)',
    checkedValidUnicodeScalars,
    examples: roundTripExamples
  },
  parserContractId,
  malformedUtf8: {
    bytesA: malformedA.toString('hex'),
    bytesB: malformedB.toString('hex'),
    rawDigestA: sha256(malformedA),
    rawDigestB: sha256(malformedB),
    rawDigestsDiffer: sha256(malformedA) !== sha256(malformedB),
    bufferUtf8DecodedCodePoints: codePoints(bufferDecodedA),
    textDecoderUtf8DecodedCodePoints: codePoints(textDecoderA),
    parserInputGenerationsEqual: parserInputGeneration(bufferDecodedA, parserContractId) ===
      parserInputGeneration(bufferDecodedB, parserContractId),
    fatalDecoderRejects: true
  },
  bom: {
    bytes: bomBytes.toString('hex'),
    rawDigest: sha256(bomBytes),
    bufferUtf8CodePoints: codePoints(bufferBom),
    textDecoderDefaultCodePoints: codePoints(textDecoderBom),
    textDecoderIgnoreBomCodePoints: codePoints(textDecoderPreserveBom),
    defaultAndBufferParserGenerationsDiffer: parserInputGeneration(bufferBom, parserContractId) !==
      parserInputGeneration(textDecoderBom, parserContractId)
  }
};

/**
 * Verify the current SCO string-response path and distinguish byte vs text
 * readers of the same response mirror.
 * @returns {Promise<object>}
 */
async function fetchResponseReaderWitness() {
  const output = '\uFEFFconst value=1;\r\n';
  const server = http.createServer((request, response) => {
    response.writeHead(200, {'content-type': 'text/javascript; charset=utf-8'});
    response.end(output);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing local HTTP address');
    const response = await fetch('http://127.0.0.1:' + address.port + '/module.js');
    const raw = Buffer.from(await response.clone().arrayBuffer());
    const text = await response.text();
    const expected = Buffer.from(output, 'utf8');
    assert.ok(raw.equals(expected));
    assert.equal(text.startsWith('\uFEFF'), false);
    return {
      contentType: response.headers.get('content-type'),
      rawResponseHex: raw.toString('hex'),
      expectedHex: expected.toString('hex'),
      rawDigest: sha256(raw),
      rawResponseEqualsUtf8Output: raw.equals(expected),
      rawFirstCodePoint: raw.toString('utf8').codePointAt(0)?.toString(16),
      responseTextFirstCodePoint: text.codePointAt(0)?.toString(16),
      responseTextStripsBom: !text.startsWith('\uFEFF')
    };
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

fetchResponseReaderWitness().then(fetchResponseReaders => {
  report.fetchResponseReaders = fetchResponseReaders;
  console.log(JSON.stringify(report, null, 2));
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
