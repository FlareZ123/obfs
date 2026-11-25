'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');

const atoms=['a','b','private.mjs','.','..',''];
const baseUrl='https://example.test/app/entry.mjs';

/**
 * Mirror the PR #374 SCO CLI's segment admission and POSIX target derivation.
 * When rejectTerminalDot is true, also apply the proposed terminal-dot fix.
 * This is a small deterministic model, not an import of the private CLI helper.
 * @param {string} specifier
 * @param {string} from
 * @param {boolean} [rejectTerminalDot]
 * @returns {string|null}
 */
function candidateTarget(specifier,from='app/entry.mjs',rejectTerminalDot=false) {
  if((!specifier.startsWith('./')&&!specifier.startsWith('../')) ||
     specifier.includes('\\'))return null;
  const rawPath=specifier.split(/[?#]/u,1)[0];
  const rawSegments=rawPath.split('/');
  if(rawSegments.some((part,index)=>index>0&&part===''))return null;
  const lastRawSegment=rawSegments[rawSegments.length-1];
  if(rejectTerminalDot&&(lastRawSegment==='.'||lastRawSegment==='..'))return null;
  /** @type {string[]} */
  const segments=[];
  for(const part of rawSegments) {
    /** @type {string} */
    let decoded;
    try{decoded=decodeURIComponent(part);}catch{return null;}
    if(/[\\/\x00]/u.test(decoded)||
       part.includes('%')&&(decoded==='.'||decoded==='..'))return null;
    segments.push(decoded);
  }
  const clean=segments.join('/');
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(from),clean));
  if(target==='..'||target.startsWith('../'))return null;
  return target;
}

/**
 * Mirror the SCO handler's exact pathname decode and name lookup key.
 * @param {string} pathname
 * @returns {string|null}
 */
function decodePublicName(pathname) {
  /** @type {string[]} */
  const segments=[];
  for(const encoded of pathname.split('/')) {
    /** @type {string} */
    let segment;
    try{segment=decodeURIComponent(encoded);}catch{return null;}
    if(segment==='.'||segment==='..'||/[\\/\x00]/u.test(segment))return null;
    segments.push(segment);
  }
  return segments.join('/');
}

const known=new Set(['entry.mjs','private.mjs']);
const witness='./private.mjs/.';
const selected=candidateTarget(witness,'entry.mjs');
assert.equal(selected,'private.mjs');
assert.ok(selected!==null);
assert.ok(known.has(selected));
const url=new URL(witness,'http://localhost/obfs/entry.mjs');
const lookup=decodePublicName(url.pathname.slice('/obfs/'.length));
assert.equal(url.pathname,'/obfs/private.mjs/');
assert.equal(lookup,'private.mjs/');
assert.notEqual(lookup,selected);
assert.equal(candidateTarget(witness,'entry.mjs',true),null);

const canonical='./private.mjs';
const canonicalTarget=candidateTarget(canonical,'entry.mjs');
const canonicalUrl=new URL(canonical,'http://localhost/obfs/entry.mjs');
const canonicalLookup=decodePublicName(canonicalUrl.pathname.slice('/obfs/'.length));
assert.equal(canonicalTarget,'private.mjs');
assert.equal(canonicalLookup,'private.mjs');

const interior='./folder/../private.mjs';
const interiorTarget=candidateTarget(interior,'entry.mjs',true);
const interiorUrl=new URL(interior,'http://localhost/obfs/entry.mjs');
const interiorLookup=decodePublicName(interiorUrl.pathname.slice('/obfs/'.length));
assert.equal(interiorTarget,'private.mjs');
assert.equal(interiorLookup,'private.mjs');

let generated=0;
let candidateAccepted=0;
let candidateInRoot=0;
let candidateMismatches=0;
let candidateNonTerminalMismatches=0;
let fixedAccepted=0;
let fixedInRoot=0;
let fixedMismatches=0;

/** @param {string[]} parts @param {number} max */
function visit(parts,max) {
  if(parts.length) {
    const specifier='./'+parts.join('/');
    generated++;
    const candidate=candidateTarget(specifier);
    if(candidate!==null) {
      candidateAccepted++;
      const urlPath=decodeURIComponent(new URL(specifier,baseUrl).pathname.slice(1));
      if(candidate!=='.'&&!candidate.startsWith('../')) {
        candidateInRoot++;
        if(candidate!==urlPath) {
          candidateMismatches++;
          if(parts[parts.length-1]!=='.'&&parts[parts.length-1]!=='..')candidateNonTerminalMismatches++;
        }
      }
    }
    const fixed=candidateTarget(specifier,'app/entry.mjs',true);
    if(fixed!==null) {
      fixedAccepted++;
      const urlPath=decodeURIComponent(new URL(specifier,baseUrl).pathname.slice(1));
      if(fixed!=='.'&&!fixed.startsWith('../')) {
        fixedInRoot++;
        if(fixed!==urlPath)fixedMismatches++;
      }
    }
  }
  if(parts.length===max)return;
  for(const atom of atoms)visit([...parts,atom],max);
}
for(let size=1;size<=5;size++)visit([],size);
assert.equal(candidateNonTerminalMismatches,0);
assert.equal(fixedMismatches,0);

console.log(JSON.stringify({
  runtime:process.version,
  witness:{specifier:witness,selectedTarget:selected,browserUrl:url.href,handlerLookupKey:lookup,publicFileSelected:known.has(selected),routeKeysMatch:String(lookup)===String(selected)},
  canonicalControl:{specifier:canonical,target:canonicalTarget,handlerLookupKey:canonicalLookup},
  boundedGrammar:{atoms,maxSegments:5,generated,candidateAccepted,candidateInRoot,candidateMismatches,candidateNonTerminalMismatches,fixedAccepted,fixedInRoot,fixedMismatches}
},null,2));
