const root={secretField:7,otherField:5};
const identity=packet=>packet;
const {secretField:first,otherField:second=99}=identity(root);
let assigned=0;
({secretField:assigned}=identity(root));
module.exports=[first,second,assigned];
