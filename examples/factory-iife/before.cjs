const owner = (() => ({
  secretField: 17,
  otherField: 5
}))();
module.exports = owner.secretField + owner.otherField;
