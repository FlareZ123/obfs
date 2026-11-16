'use strict';
function mux(a,b,c,d){return (a?((b^c)&255):((~b)|d));}
module.exports=mux;
