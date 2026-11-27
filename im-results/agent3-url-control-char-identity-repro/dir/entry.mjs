import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reproduce the WHATWG URL / POSIX path identity mismatch with Node's native
 * ESM resolver. Run with:
 *
 *   node im-results/agent3-url-control-char-identity-repro/dir/entry.mjs
 *
 * No target files are required: import.meta.resolve() resolves the specifier
 * against this real file-backed module URL without loading the target.
 */
const baseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importerPath = 'dir/entry.mjs';
const controls = [
  { name: 'TAB', value: '\t' },
  { name: 'LF', value: '\n' },
  { name: 'CR', value: '\r' },
];

const cases = [];
for (const control of controls) {
  for (const dotSegment of ['.', '..']) {
    for (let insertion = 0; insertion <= dotSegment.length; insertion += 1) {
      const segment =
        dotSegment.slice(0, insertion) + control.value + dotSegment.slice(insertion);
      const specifier = `./a/${segment}/../secret.mjs`;
      const resolvedUrl = import.meta.resolve(specifier);
      const resolvedPath = fileURLToPath(resolvedUrl);
      const urlTarget = path.relative(baseDirectory, resolvedPath).split(path.sep).join('/');
      const posixTarget = path.posix.normalize(
        path.posix.join(path.posix.dirname(importerPath), specifier),
      );

      cases.push({
        control: control.name,
        segment: segment
          .replaceAll('\t', '\\t')
          .replaceAll('\n', '\\n')
          .replaceAll('\r', '\\r'),
        specifier: specifier
          .replaceAll('\t', '\\t')
          .replaceAll('\n', '\\n')
          .replaceAll('\r', '\\r'),
        urlTarget,
        posixTarget,
        mismatch: urlTarget !== posixTarget,
      });
    }
  }
}

const mismatchCount = cases.filter((entry) => entry.mismatch).length;
const summary = {
  runtime: process.version,
  totalCases: cases.length,
  mismatchCount,
  allMismatched: mismatchCount === cases.length,
  cases,
};

console.log(JSON.stringify(summary, null, 2));
if (mismatchCount !== cases.length) {
  process.exitCode = 1;
}
