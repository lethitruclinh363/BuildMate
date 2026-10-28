function listingOf(doc) {
  if (doc.listingStatus === 'PAUSED' || doc.listingStatus === 'DISCONTINUED' || doc.listingStatus === 'ACTIVE') {
    return doc.listingStatus;
  }
  return doc.isActive === false ? 'PAUSED' : 'ACTIVE';
}

function saleStateOf(doc) {
  const listing = listingOf(doc);
  if (listing === 'DISCONTINUED') return 'discontinued';
  if (listing === 'PAUSED') return 'paused';
  if (Number(doc.stock) <= 0 || doc.saleAvailability === 'MANUALLY_UNAVAILABLE') return 'out';
  return 'selling';
}

function purchaseBlock(doc) {
  const state = saleStateOf(doc);
  if (state === 'discontinued') return 'This product has been discontinued';
  if (state === 'paused') return 'This product is currently paused';
  if (state === 'out') return 'This product is currently out of stock';
  return '';
}

function publicPriceVisible(doc) {
  return saleStateOf(doc) !== 'discontinued';
}

module.exports = { listingOf, saleStateOf, purchaseBlock, publicPriceVisible };
