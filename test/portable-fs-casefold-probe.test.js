'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createPathInventory,registerFilePath}=require('../src/portable-paths');
const {unicodeCaseFold}=require('../src/unicode-casefold');

test('report native filesystem aliasing for candidate Unicode case-fold pairs',async()=>{
  const pairs=[
    {label:'ASCII case-only control',a:'A.txt',b:'a.txt'},
    {label:'Greek theta full-fold candidate',a:'ϑ.txt',b:'ϴ.txt'},
    {label:'Greek sigma/final sigma',a:'σ.txt',b:'ς.txt'},
    {label:'Latin s/long s',a:'s.txt',b:'ſ.txt'},
    {label:'NFC/NFD',a:'café.txt',b:'cafe\u0301.txt'},
    {label:'sharp s',a:'ß.txt',b:'ẞ.txt'},
    // Full default case-fold outputs match for both names (ssθ), but the
    // candidate's three independent lowercase/uppercase keys do not all
    // match across this compound pair. A native alias would expose a gap.
    {label:'compound sharp-s plus Greek-theta full-fold composition',a:'ßϑ.txt',b:'ẞϴ.txt'},
    // A default-casefold negative control: the new composite heuristic below
    // would collapse this pair even though full case folding keeps it distinct.
    {label:'dotless-I plus sharp-s non-fold-equivalent control',a:'ıß.txt',b:'iẞ.txt'},
    {label:'zero-width space versus absent',a:'ab.txt',b:'a\u200Bb.txt'},
    {label:'soft hyphen versus absent',a:'ab.txt',b:'a\u00ADb.txt'},
    {label:'zero-width non-joiner versus absent',a:'ab.txt',b:'a\u200Cb.txt'},
    {label:'zero-width joiner versus absent',a:'ab.txt',b:'a\u200Db.txt'},
    {label:'word joiner versus absent',a:'ab.txt',b:'a\u2060b.txt'},
    {label:'combining grapheme joiner versus absent',a:'ab.txt',b:'a\u034Fb.txt'},
    {label:'byte-order mark versus absent',a:'ab.txt',b:'a\uFEFFb.txt'},
    {label:'Mongolian vowel separator versus absent',a:'ab.txt',b:'a\u180Eb.txt'},
    {label:'ASCII e versus accented e',a:'e.txt',b:'é.txt'},
    {label:'ASCII a versus accented a',a:'a.txt',b:'á.txt'},
    {label:'ASCII n versus accented n',a:'n.txt',b:'ñ.txt'},
    {label:'ASCII A versus fullwidth A',a:'A.txt',b:'Ａ.txt'},
    {label:'ASCII 1 versus circled one',a:'1.txt',b:'①.txt'},
    {label:'ASCII ffi versus ligature ffi',a:'ffi.txt',b:'ﬃ.txt'},
    {label:'ASCII K versus Kelvin sign',a:'K.txt',b:'K.txt'},
    {label:'dotless I',a:'I.txt',b:'ı.txt'}
  ];
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'obfs-casefold-'));
  const rows=[];
  try{
    for(let i=0;i<pairs.length;i++){
      const pair=pairs[i];
      const directory=path.join(root,String(i));
      await fs.mkdir(directory);
      await fs.writeFile(path.join(directory,pair.a),'first');
      await fs.writeFile(path.join(directory,pair.b),'second');
      const entries=await fs.readdir(directory);
      const [a,b]=await Promise.all([
        fs.readFile(path.join(directory,pair.a),'utf8'),
        fs.readFile(path.join(directory,pair.b),'utf8')
      ]);
      const compositeKey=name=>{
        const normalized=name.normalize('NFC');
        const lower=normalized.toLowerCase().normalize('NFC');
        return lower.toUpperCase().normalize('NFC').toLowerCase().normalize('NFC');
      };
      const candidateCompositeKeyRejects=compositeKey(pair.a)===compositeKey(pair.b);
      const inventory=createPathInventory();
      registerFilePath(inventory,pair.a);
      let portableInventoryRejects=false;
      try{registerFilePath(inventory,pair.b);}catch{portableInventoryRejects=true;}
      rows.push({
        label:pair.label,a:pair.a,b:pair.b,entries,
        filesystemAliases:entries.length===1||a===b,
        candidateCompositeKeyRejects,
        unicodeCaseFoldEquivalent:unicodeCaseFold(pair.a)===unicodeCaseFold(pair.b),
        portableInventoryRejects
      });
    }
    console.log('PORTABLE_FS_CASEFOLD_PROBE '+JSON.stringify({
      platform:process.platform,node:process.version,unicode:process.versions.unicode,rows
    }));
    assert.equal(rows.length,pairs.length);
    const unprotectedAliases=rows.filter(row=>row.filesystemAliases&&!row.portableInventoryRejects);
    assert.deepEqual(unprotectedAliases,[],
      'portable path inventory accepted names that this native filesystem aliases');
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
