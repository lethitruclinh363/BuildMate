const { Material } = require('../models/Material');
const { Store, STORE_TYPE } = require('../models/Store');
const { ContractorProfile, VERIFICATION_STATUS } = require('../models/ContractorProfile');
const { ApiError } = require('../utils/ApiError');

async function assertMaterialStore(storeId, { published = false } = {}) {
  const store = await Store.findById(storeId);
  if (!store || store.storeType !== STORE_TYPE.MATERIALS) {
    throw new ApiError(403, 'Only a material store can manage materials');
  }
  if (published) {
    const profile = await ContractorProfile.findOne({ userId: store.contractorId });
    if (profile?.verificationStatus !== VERIFICATION_STATUS.APPROVED || store.status !== 'LIVE') {
      throw new ApiError(403, 'Material store must be approved before publishing products');
    }
  }
  return store;
}

async function listMaterials(storeId) {
  await assertMaterialStore(storeId);
  const items = await Material.find({ storeId }).sort({ createdAt: -1 });
  return items.map((item) => item.toPublic());
}

async function createMaterial(storeId, payload) {
  await assertMaterialStore(storeId, { published: true });
  const item = await Material.create({ storeId, ...payload });
  return item.toPublic();
}

async function updateMaterial(storeId, id, payload) {
  await assertMaterialStore(storeId, { published: true });
  const item = await Material.findOneAndUpdate({ _id: id, storeId }, payload, {
    new: true,
    runValidators: true,
  });
  if (!item) throw new ApiError(404, 'Material not found');
  return item.toPublic();
}

async function deleteMaterial(storeId, id) {
  await assertMaterialStore(storeId, { published: true });
  const item = await Material.findOneAndDelete({ _id: id, storeId });
  if (!item) throw new ApiError(404, 'Material not found');
  return { deleted: true, id };
}

module.exports = { listMaterials, createMaterial, updateMaterial, deleteMaterial };
