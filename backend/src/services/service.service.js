const { Service } = require('../models/Service');
const { Store, STORE_TYPE } = require('../models/Store');
const { ApiError } = require('../utils/ApiError');

async function assertServiceStore(storeId) {
  const store = await Store.findById(storeId);
  if (!store || store.storeType === STORE_TYPE.MATERIALS) {
    throw new ApiError(403, 'Material stores cannot publish repair services');
  }
  return store;
}

async function listServices(storeId) {
  await assertServiceStore(storeId);
  const items = await Service.find({ storeId }).sort({ createdAt: -1 });
  return items.map((item) => item.toPublic());
}

async function createService(storeId, contractorId, payload) {
  await assertServiceStore(storeId);
  const item = await Service.create({ storeId, contractorId, ...payload });
  return item.toPublic();
}

async function updateService(storeId, id, payload) {
  await assertServiceStore(storeId);
  const item = await Service.findOneAndUpdate({ _id: id, storeId }, payload, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new ApiError(404, 'Service not found');
  return item.toPublic();
}

async function deleteService(storeId, id) {
  await assertServiceStore(storeId);
  const item = await Service.findOneAndDelete({ _id: id, storeId });
  if (!item) throw new ApiError(404, 'Service not found');
  return { deleted: true, id };
}

module.exports = { listServices, createService, updateService, deleteService };
