'use strict';
function branch(a,b,c,d){return (a?((((b^c)^(d<<5))&((b|d)^(c>>>3)))^((((d^b)&(c|7))<<(b&7))|((c^d)>>>2))):d);}
module.exports=branch;
