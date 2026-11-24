'use strict';

const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');

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

const report = {
  node: process.versions.node,
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

console.log(JSON.stringify(report, null, 2));
