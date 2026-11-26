'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createPathInventory,registerFilePath}=require('../src/portable-paths');

test('report native filesystem aliasing for candidate Unicode case-fold pairs',async()=>{
  const pairs=[
    {label:'Greek theta full-fold candidate',a:'ϑ.txt',b:'ϴ.txt'},
    {label:'Greek sigma/final sigma',a:'σ.txt',b:'ς.txt'},
    {label:'Latin s/long s',a:'s.txt',b:'ſ.txt'},
    {label:'NFC/NFD',a:'café.txt',b:'cafe\u0301.txt'},
    {label:'sharp s',a:'ß.txt',b:'ẞ.txt'},
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
      const inventory=createPathInventory();
      registerFilePath(inventory,pair.a);
      let portableInventoryRejects=false;
      try{registerFilePath(inventory,pair.b);}catch{portableInventoryRejects=true;}
      rows.push({
        label:pair.label,a:pair.a,b:pair.b,entries,
        filesystemAliases:entries.length===1||a===b,
        portableInventoryRejects
      });
    }
    console.log('PORTABLE_FS_CASEFOLD_PROBE '+JSON.stringify({
      platform:process.platform,node:process.version,unicode:process.versions.unicode,rows
    }));
    assert.equal(rows.length,pairs.length);
  }finally{
    await fs.rm(root,{recursive:true,force:true});
  }
});
