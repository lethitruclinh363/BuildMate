const { STORE_TYPE, STORE_STATUS } = require('../models/Store');
const { Store } = require('../repositories/partnerAccess');
const { Material } = require('../repositories/offeringAccess');
const { ApiError } = require('../utils/ApiError');
const { distanceKm } = require('../utils/geo');
const { normalizeDeliveryPolicy } = require('../utils/delivery-policy');
const { summarizeMaterialCheckout } = require('../utils/material-checkout');

function mergeLines(items) {
  const quantities = new Map();
  for (const item of items) {
    const id = String(item.materialId);
    quantities.set(id, (quantities.get(id) || 0) + Number(item.quantity));
  }
  return quantities;
}

async function prepare(body, { requireLive = false } = {}) {
  const store = await Store.findById(body.storeId);
  if (!store || store.storeType !== STORE_TYPE.MATERIALS) {
    throw new ApiError(404, 'Material store not found');
  }
  if (requireLive && store.status !== STORE_STATUS.LIVE) {
    throw new ApiError(409, 'Material store is not open for orders');
  }

  const coordinates = store.location?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) {
    throw new ApiError(422, 'Store location is missing');
  }

  const quantities = mergeLines(body.items);
  const ids = [...quantities.keys()];
  const materials = await Material.find({
    _id: { $in: ids },
    storeId: store._id,
    isActive: true,
  });
  if (materials.length !== ids.length) {
    throw new ApiError(422, 'Some materials are no longer available');
  }

  const byId = new Map(materials.map((material) => [String(material._id), material]));
  const lines = [];
  let materialSubtotal = 0;
  for (const [materialId, quantity] of quantities) {
    const material = byId.get(materialId);
    const minOrderQty = Math.max(1, Number(material.minOrderQty) || 1);
    const stock = Math.max(0, Number(material.stock) || 0);
    if (quantity < minOrderQty) {
      throw new ApiError(422, 'Quantity is below the minimum order');
    }
    if (quantity > stock) {
      throw new ApiError(422, 'Not enough stock for this order');
    }
    const price = Number(material.price) || 0;
    const lineTotal = price * quantity;
    materialSubtotal += lineTotal;
    lines.push({
      materialId,
      name: material.name,
      image: material.image || '',
      unit: material.unit,
      price,
      quantity,
      lineTotal,
    });
  }

  const km = distanceKm(
    { lat: Number(coordinates[1]), lng: Number(coordinates[0]) },
    { lat: body.lat, lng: body.lng }
  );
  const summary = summarizeMaterialCheckout({
    policy: normalizeDeliveryPolicy(store),
    distanceKm: km,
    materialSubtotal,
  });

  return {
    store,
    lines,
    summary: {
      ...summary,
      storeId: String(store._id),
      storeName: store.name || '',
      address: body.address,
      lines,
    },
  };
}

async function quote(body) {
  const prepared = await prepare(body);
  return prepared.summary;
}

module.exports = { quote, prepare };
