'use strict';
function fuse(a,b,c){return (((a^b)&(c>>>3))|((b<<c)^0x13579));}
module.exports=fuse;
