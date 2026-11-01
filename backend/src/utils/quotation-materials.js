async function materialListForRequest(requestId) {
  if (!requestId) return [];
  try {
    const repo = require('../repositories/materialRequirement.postgres');
    const requestRow = await repo.requestRow(String(requestId));
    const mrl = requestRow ? await repo.findActiveByRequest(requestRow.id) : null;
    if (!mrl?.items?.length) return [];
    return mrl.items
      .map((item) => ({
        name: String(item.name || '').trim(),
        specification: String(item.specification || '').trim(),
        unit: String(item.unit || '').trim(),
        quantity: Number(item.quantity) || 0,
        notes: String(item.notes || '').trim(),
      }))
      .filter((item) => item.name);
  } catch {
    return [];
  }
}

async function withMaterialList(quote) {
  if (!quote) return null;
  const materialList = await materialListForRequest(quote.requestId);
  return { ...quote, materialList };
}

module.exports = { materialListForRequest, withMaterialList };
