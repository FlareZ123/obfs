#!/usr/bin/env node
'use strict';

// Bounded model audit for the PR #379 ESM URL/POSIX pathname guard.
// Pin: d50de9794660aaf4c7ce1981396196e930c3d21d
// This intentionally mirrors the admission rules; it is not a substitute for
// the repository's native ESM, CLI, HTTP, or cross-platform test suites.

const path = require('node:path');
const assert = require('node:assert/strict');

function hasUrlPathnameNormalizationHazard(specifier) {
  const pathname = specifier.split(/[?#]/u, 1)[0];
  if (/[\u0000-\u001f\u007f]/u.test(pathname)) return true;
  return !/[?#]/u.test(specifier) && specifier.endsWith(' ');
}

function hasTerminalUrlDotSegment(specifier) {
  const pathname = specifier.split(/[?#]/u, 1)[0];
  const finalSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return finalSegment === '.' || finalSegment === '..';
}

function safePath(file) {
  if (typeof file !== 'string' || !file || file.includes('\\') ||
      /[<>:"|?*\x00-\x1f\x7f]/u.test(file) || path.posix.isAbsolute(file)) return false;
  if (/[\uD800-\uDFFF]/u.test(file)) return false;
  for (const segment of file.split('/')) {
    if (/[. ]$/u.test(segment) ||
        /^(?:con|prn|aux|nul|conin\$|conout\$|com[0-9¹²³]|lpt[0-9¹²³]) *(?:\.|$)/iu.test(segment) ||
        /~[0-9]+(?=\.|$)/u.test(segment)) return false;
  }
  const normalized = path.posix.normalize(file);
  return !(normalized === '..' || normalized.startsWith('../') ||
    normalized === '.' || normalized !== file);
}

function candidateScoTarget(specifier, importer = 'dir/entry.mjs') {
  if ((!specifier.startsWith('./') && !specifier.startsWith('../')) ||
      hasUrlPathnameNormalizationHazard(specifier) || specifier.includes('\\')) return null;

  const rawPath = specifier.split(/[?#]/u, 1)[0];
  const rawSegments = rawPath.split('/');
  if (rawSegments.some((segment, index) => index > 0 && segment === '') ||
      hasTerminalUrlDotSegment(specifier)) return null;

  const decodedSegments = [];
  for (const segment of rawSegments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (/[\\/\x00-\x1f\x7f]/u.test(decoded) ||
        (segment.includes('%') && (decoded === '.' || decoded === '..'))) return null;
    decodedSegments.push(decoded);
  }

  const target = path.posix.normalize(
    path.posix.join(path.posix.dirname(importer), decodedSegments.join('/'))
  );
  if (target === '..' || target.startsWith('../') || !safePath(target)) return null;
  return target;
}

function urlTarget(specifier, base) {
  try {
    const url = new URL(specifier, base);
    const decodedSegments = url.pathname.split('/').slice(1).map(segment => decodeURIComponent(segment));
    return path.posix.normalize(decodedSegments.join('/'));
  } catch {
    return null;
  }
}

function decodeScoRequestName(encodedName) {
  const decoded = [];
  for (const segment of encodedName.split('/')) {
    let value;
    try {
      value = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (value === '.' || value === '..' || /[\\/\x00-\x1f\x7f]/u.test(value)) return null;
    decoded.push(value);
  }
  return decoded.join('/');
}

const atoms = [
  '.', '..', 'a', 'b', 'x y', 'hello%20world', '%23', '%3f', '%25',
  '%252f', '%252e', '%2e', '%2e%2e', '%2e.', '.%2e', '%2f', '%5c',
  '%00', '%7f', '%2525', 'é', '%C3%A9', '\u0085', '\u00a0', '\u2028',
  '\u2029', '\uFEFF', '\uD800', '\uDC00', '😀', ':', ';', '!', '~',
  'CON', 'x~1.mjs', 'a#b', 'a?b', 'a\\b'
];
for (let value = 0; value <= 0x1f; value++) atoms.push(String.fromCharCode(value));
atoms.push(String.fromCharCode(0x7f));
for (let value = 0; value <= 0x1f; value++) atoms.push('%' + value.toString(16).padStart(2, '0'));
atoms.push('%7f');

const suffixes = ['', '?q', '#f', '?q#f', '#f?q', ' ?q', ' #f', '?q ', '#f '];
const variants = new Set();
for (const atom of atoms) {
  for (const prefix of ['./', './a/', '../']) {
    for (const suffixPath of ['/secret.mjs', '/../secret.mjs', '/b/secret.mjs', '']) {
      for (const suffix of suffixes) variants.add(prefix + atom + suffixPath + suffix);
    }
  }
  variants.add('./a/' + atom + '/b/../secret.mjs');
}
for (const first of atoms) {
  for (const second of atoms) {
    variants.add('./a/' + first + '/' + second + '/secret.mjs');
    variants.add('./a/' + first + '/' + second + '/../secret.mjs');
  }
}

let accepted = 0;
let rawControlRefused = 0;
let encodedControlRefused = 0;
let httpsMismatches = 0;
let fileMismatches = 0;
const mismatchExamples = [];

for (const specifier of variants) {
  const target = candidateScoTarget(specifier);
  if (target === null) {
    const pathname = specifier.split(/[?#]/u, 1)[0];
    if (/[\u0000-\u001f\u007f]/u.test(pathname)) rawControlRefused++;
    if (/%(?:0[0-9a-f]|1[0-9a-f]|7f)/iu.test(pathname)) encodedControlRefused++;
    continue;
  }

  accepted++;
  for (const [kind, base] of [
    ['https', 'https://example.test/dir/entry.mjs'],
    ['file', 'file:///dir/entry.mjs']
  ]) {
    const resolved = urlTarget(specifier, base);
    if (resolved !== target) {
      if (kind === 'https') httpsMismatches++;
      else fileMismatches++;
      if (mismatchExamples.length < 12) mismatchExamples.push({
        kind, specifier: JSON.stringify(specifier), target, resolved
      });
    }
  }
}

const encodedControlsRejectedAtRoute = Array.from({ length: 33 }, (_, index) =>
  index === 32 ? '%7f' : '%' + index.toString(16).padStart(2, '0')
).every(value => decodeScoRequestName('secret' + value + '.mjs') === null);

const boundaryChecks = {
  internalSpaceAccepted: candidateScoTarget('./a/hello world.mjs') !== null,
  percentEncodedSpaceAccepted: candidateScoTarget('./a/hello%20world.mjs') !== null,
  trailingPathSpaceRefused: candidateScoTarget('./a/secret.mjs ') === null,
  trailingSpaceBeforeQueryRefusedBySafePath: candidateScoTarget('./a/secret.mjs ?q') === null,
  querySuffixControlPreservesPath: candidateScoTarget('./a/secret.mjs?q\t') === 'dir/a/secret.mjs',
  fragmentSuffixControlPreservesPath: candidateScoTarget('./a/secret.mjs#f\n') === 'dir/a/secret.mjs',
  explicitDelFilenameRefused: !safePath('del' + String.fromCharCode(0x7f) + '.mjs'),
  encodedControlsRejectedAtRoute
};

assert.equal(httpsMismatches, 0, JSON.stringify(mismatchExamples));
assert.equal(fileMismatches, 0, JSON.stringify(mismatchExamples));
assert.equal(rawControlRefused > 0, true);
assert.equal(encodedControlRefused > 0, true);
assert.ok(Object.values(boundaryChecks).every(Boolean), JSON.stringify(boundaryChecks));

console.log(JSON.stringify({
  node: process.version,
  generated: variants.size,
  accepted,
  rawControlRefused,
  encodedControlRefused,
  httpsMismatches,
  fileMismatches,
  boundaryChecks,
  mismatchExamples
}, null, 2));
