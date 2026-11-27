import path from 'node:path';

/**
 * Bounded differential audit for PR #379's ESM URL/POSIX path predicates.
 *
 * This is a self-contained mirror of the candidate's SCO and cross-properties
 * path helpers at reviewed head 1a60af1facbceeed0417017581a092cc9fb8080c,
 * extended with literal TAB/LF/CR dot-segment atoms. It is not a proof for
 * every URL spelling, custom loader, import map, symlink, or deployment rewrite.
 *
 * Run with:
 *   node im-results/agent3-url-control-char-identity-repro/audit.mjs
 */
const atoms = [
  'a', 'b', 'private.mjs', '.', '..', '',
  '%2e', '%2E', '.%2e', '%2e.', '%2e%2e',
  '%2f', '%2F', '%5c', '%25', '%252e', '%252e%252e', '%252f',
  'foo%2ebar', 'x%23y', 'x%3Fy',
  '.\t', '..\t', '.\n', '..\n', '.\r', '..\r',
];
const suffixes = ['', '/', '?v=1', '#frag', '?v=1#frag', '#frag/..', '?x/../y'];
const from = 'app/entry.mjs';
const baseUrl = 'https://example.test/app/entry.mjs';

function hasTerminalUrlDotSegment(specifier) {
  const pathname = specifier.split(/[?#]/u, 1)[0];
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last === '.' || last === '..';
}

function hasPathControl(specifier) {
  const pathname = specifier.split(/[?#]/u, 1)[0];
  return /[\u0000-\u001f\u007f]/u.test(pathname);
}

function decodePublicName(pathname) {
  const decoded = [];
  for (const segment of pathname.split('/')) {
    let value;
    try { value = decodeURIComponent(segment); } catch { return null; }
    if (value === '.' || value === '..' || /[\\/\x00]/u.test(value)) return null;
    decoded.push(value);
  }
  return decoded.join('/');
}

function safePathAdmissible(filename) {
  if (!filename || filename.includes('\\') || /[<>:"|?*\x00-\x1f]/u.test(filename) || path.posix.isAbsolute(filename)) return false;
  for (const segment of filename.split('/')) if (/[. ]$/u.test(segment)) return false;
  const normalized = path.posix.normalize(filename);
  return normalized !== '..' && !normalized.startsWith('../') && normalized !== '.' && normalized === filename;
}

function candidateTarget(specifier, rejectTerminalDot = false, rejectControl = false) {
  if ((!specifier.startsWith('./') && !specifier.startsWith('../')) || specifier.includes('\\')) return null;
  if (rejectControl && hasPathControl(specifier)) return null;
  const rawPath = specifier.split(/[?#]/u, 1)[0];
  const segments = rawPath.split('/');
  if (segments.some((segment, index) => index > 0 && segment === '')) return null;
  if (rejectTerminalDot && hasTerminalUrlDotSegment(specifier)) return null;
  const decoded = [];
  for (const segment of segments) {
    let value;
    try { value = decodeURIComponent(segment); } catch { return null; }
    if (/[\\/\x00]/u.test(value) || (segment.includes('%') && (value === '.' || value === '..'))) return null;
    decoded.push(value);
  }
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded.join('/')));
  return target === '..' || target.startsWith('../') ? null : target;
}

function crossPropertiesTarget(specifier, rejectControl = false) {
  if ((!specifier.startsWith('./') && !specifier.startsWith('../')) || /[?#%\\]/u.test(specifier) || specifier.includes('//')) return null;
  if (hasTerminalUrlDotSegment(specifier) || (rejectControl && hasPathControl(specifier))) return null;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier));
  return target === '..' || target.startsWith('../') ? null : target;
}

const counts = {
  generated: 0,
  preGuardSco: { accepted: 0, mismatches: 0, safeFileMismatches: 0 },
  terminalDotSco: { accepted: 0, mismatches: 0 },
  preGuardCross: { accepted: 0, mismatches: 0, uniqueSafePairs: 0 },
  controlGuardSco: { accepted: 0, mismatches: 0 },
  controlGuardCross: { accepted: 0, mismatches: 0 },
};
const safePairs = new Set();

function visit(parts, maxDepth) {
  if (parts.length > 0) {
    for (const suffix of suffixes) {
      const specifier = './' + parts.join('/') + suffix;
      counts.generated += 1;
      const routeTarget = decodePublicName(new URL(specifier, baseUrl).pathname.slice(1));

      const oldSco = candidateTarget(specifier);
      if (oldSco !== null) {
        counts.preGuardSco.accepted += 1;
        if (oldSco !== routeTarget) {
          counts.preGuardSco.mismatches += 1;
          if (safePathAdmissible(oldSco)) counts.preGuardSco.safeFileMismatches += 1;
        }
      }

      const terminalSco = candidateTarget(specifier, true, false);
      if (terminalSco !== null) {
        counts.terminalDotSco.accepted += 1;
        if (terminalSco !== routeTarget) counts.terminalDotSco.mismatches += 1;
      }

      const oldCross = crossPropertiesTarget(specifier);
      if (oldCross !== null && safePathAdmissible(oldCross)) {
        counts.preGuardCross.accepted += 1;
        if (oldCross !== routeTarget) {
          counts.preGuardCross.mismatches += 1;
          safePairs.add(oldCross + '\u0000' + String(routeTarget));
        }
      }

      const guardedSco = candidateTarget(specifier, true, true);
      if (guardedSco !== null) {
        counts.controlGuardSco.accepted += 1;
        if (guardedSco !== routeTarget) counts.controlGuardSco.mismatches += 1;
      }

      const guardedCross = crossPropertiesTarget(specifier, true);
      if (guardedCross !== null && safePathAdmissible(guardedCross)) {
        counts.controlGuardCross.accepted += 1;
        if (guardedCross !== routeTarget) counts.controlGuardCross.mismatches += 1;
      }
    }
  }
  if (parts.length === maxDepth) return;
  for (const atom of atoms) visit([...parts, atom], maxDepth);
}

visit([], 4);
counts.preGuardCross.uniqueSafePairs = safePairs.size;
const ordinarySpacePathnamesAllowed = ['./a/my file.mjs', './a/my%20file.mjs']
  .every((specifier) => !hasPathControl(specifier));
const auditAssertionsPassed =
  counts.generated === 3863160 &&
  counts.preGuardCross.mismatches === 804 &&
  counts.preGuardCross.uniqueSafePairs === 85 &&
  counts.controlGuardSco.mismatches === 0 &&
  counts.controlGuardCross.mismatches === 0 &&
  ordinarySpacePathnamesAllowed;
console.log(JSON.stringify({
  runtime: process.version,
  ordinarySpacePathnamesAllowed,
  auditAssertionsPassed,
  atoms: atoms.length,
  suffixes: suffixes.length,
  maxSegments: 4,
  counts,
}, null, 2));
if (!auditAssertionsPassed) process.exitCode = 1;
