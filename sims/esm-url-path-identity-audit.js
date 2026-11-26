'use strict';

const assert=require('node:assert/strict');
const path=require('node:path');

const atoms=[
  'a','b','private.mjs','.','..','',
  '%2e','%2E','.%2e','%2e.','%2e%2e',
  '%2f','%2F','%5c','%25','%252e','%252e%252e','%252f',
  'foo%2ebar','x%23y','x%3Fy'
];
const suffixes=['','/','?v=1','#frag','?v=1#frag','#frag/..','?x/../y'];
const baseUrl='https://example.test/app/entry.mjs';

/**
 * @param {string} specifier
 * @returns {boolean}
 */
function hasTerminalUrlDotSegment(specifier) {
  const pathname=specifier.split(/[?#]/u,1)[0];
  const finalSegment=pathname.slice(pathname.lastIndexOf('/')+1);
  return finalSegment==='.'||finalSegment==='..';
}

/**
 * Mirror SCO CLI URL-path admission and POSIX target derivation.
 * @param {string} specifier
 * @param {string} from
 * @param {boolean} rejectTerminalDot
 * @returns {string|null}
 */
function candidateTarget(specifier,from,rejectTerminalDot) {
  if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
     specifier.includes('\\'))return null;
  const rawPath=specifier.split(/[?#]/u,1)[0];
  const rawSegments=rawPath.split('/');
  if(rawSegments.some((part,index)=>index>0&&part==='')||
     rejectTerminalDot&&hasTerminalUrlDotSegment(specifier))return null;
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
  const target=path.posix.normalize(
    path.posix.join(path.posix.dirname(from),segments.join('/')));
  if(target==='..'||target.startsWith('../'))return null;
  return target;
}

/**
 * Mirror the SCO handler's one-decode-per-path-segment lookup.
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

/**
 * Mirror the cross-properties graph preflight plus its strict relative resolver.
 * @param {string} specifier
 * @param {string} from
 * @returns {string|null}
 */
function crossPropertiesTarget(specifier,from) {
  if((!specifier.startsWith('./')&&!specifier.startsWith('../'))||
     /[?#%\\]/u.test(specifier)||specifier.includes('//')||
     hasTerminalUrlDotSegment(specifier))return null;
  const target=path.posix.normalize(path.posix.join(path.posix.dirname(from),specifier));
  if(target==='..'||target.startsWith('../'))return null;
  return target;
}

/**
 * Mirror the path-identity-relevant portion of safePath. This filters invalid
 * root/directory spellings from a module-file lookup; trailing slash is kept
 * because an in-memory URL handler can deliberately serve that exact key.
 * @param {string} filename
 * @returns {boolean}
 */
function safePathAdmissible(filename) {
  if(!filename||filename.includes('\\')||/[<>:\x22|?*\x00-\x1f]/u.test(filename)||
     path.posix.isAbsolute(filename))return false;
  for(const segment of filename.split('/'))if(/[. ]$/u.test(segment))return false;
  const normalized=path.posix.normalize(filename);
  return normalized!=='..'&&!normalized.startsWith('../')&&
    normalized!=='.'&&normalized===filename;
}

const witness='./private.mjs/.';
const oldSelected=candidateTarget(witness,'app/entry.mjs',false);
const witnessUrl=new URL(witness,baseUrl);
const witnessLookup=decodePublicName(witnessUrl.pathname.slice(1));
assert.equal(oldSelected,'app/private.mjs');
assert.equal(witnessUrl.pathname,'/app/private.mjs/');
assert.equal(witnessLookup,'app/private.mjs/');
assert.notEqual(oldSelected,witnessLookup);
assert.equal(candidateTarget(witness,'app/entry.mjs',true),null);

const canonical='./private.mjs';
assert.equal(candidateTarget(canonical,'app/entry.mjs',true),'app/private.mjs');
assert.equal(decodePublicName(new URL(canonical,baseUrl).pathname.slice(1)),'app/private.mjs');
const interior='./folder/../private.mjs';
assert.equal(candidateTarget(interior,'app/entry.mjs',true),'app/private.mjs');
assert.equal(decodePublicName(new URL(interior,baseUrl).pathname.slice(1)),'app/private.mjs');

let generated=0;
let oldAccepted=0;
let oldMismatches=0;
let oldPotentialMismatches=0;
let oldNonTerminalMismatches=0;
let fixedAccepted=0;
let fixedMismatches=0;
let crossAccepted=0;
let crossMismatches=0;
/** @type {Array<{kind:string,specifier:string,target:string,route:string|null}>} */
const examples=[];

/** @param {string[]} parts @param {number} max */
function visit(parts,max) {
  if(parts.length) {
    for(const suffix of suffixes) {
      const specifier='./'+parts.join('/')+suffix;
      generated++;
      const route=decodePublicName(new URL(specifier,baseUrl).pathname.slice(1));
      const oldTarget=candidateTarget(specifier,'app/entry.mjs',false);
      if(oldTarget!==null) {
        oldAccepted++;
        if(oldTarget!==route) {
          oldMismatches++;
          if(safePathAdmissible(oldTarget)&&
             !('app/entry.mjs'.startsWith(oldTarget.endsWith('/')?oldTarget:oldTarget+'/')))oldPotentialMismatches++;
          const pathname=specifier.split(/[?#]/u,1)[0];
          const finalSegment=pathname.slice(pathname.lastIndexOf('/')+1);
          if(finalSegment!=='.'&&finalSegment!=='..')oldNonTerminalMismatches++;
          if(examples.length<12)examples.push({kind:'pre-fix-sco',specifier,target:oldTarget,route});
        }
      }
      const fixedTarget=candidateTarget(specifier,'app/entry.mjs',true);
      if(fixedTarget!==null) {
        fixedAccepted++;
        if(fixedTarget!==route) {
          fixedMismatches++;
          if(examples.length<12)examples.push({kind:'fixed-sco',specifier,target:fixedTarget,route});
        }
      }
      const crossTarget=crossPropertiesTarget(specifier,'app/entry.mjs');
      if(crossTarget!==null&&safePathAdmissible(crossTarget)) {
        crossAccepted++;
        if(crossTarget!==route) {
          crossMismatches++;
          if(examples.length<12)examples.push({kind:'cross-properties',specifier,target:crossTarget,route});
        }
      }
    }
  }
  if(parts.length===max)return;
  for(const atom of atoms)visit([...parts,atom],max);
}

visit([],4);
assert.equal(oldNonTerminalMismatches,0);
assert.ok(oldPotentialMismatches>0);
assert.equal(fixedMismatches,0);
assert.equal(crossMismatches,0);

console.log(JSON.stringify({
  runtime:process.version,
  grammar:{atoms,suffixes,maxSegments:4,generated},
  preFixSco:{accepted:oldAccepted,mismatches:oldMismatches,
    potentialFileMismatches:oldPotentialMismatches,
    nonTerminalMismatches:oldNonTerminalMismatches},
  fixedSco:{accepted:fixedAccepted,mismatches:fixedMismatches},
  crossProperties:{accepted:crossAccepted,mismatches:crossMismatches},
  terminalDotWitness:{specifier:witness,preFixTarget:oldSelected,
    urlPath:witnessUrl.pathname,handlerLookupKey:witnessLookup},
  examples
},null,2));
