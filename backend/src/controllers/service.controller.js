const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const serviceService = require('../services/service.service');

const list = asyncHandler(async (req, res) => {
  const data = await serviceService.listServices(req.store._id);
  return success(res, data, 'Services retrieved');
});

const create = asyncHandler(async (req, res) => {
  const data = await serviceService.createService(req.store._id, req.user.id, req.body);
  return created(res, data, 'Service added');
});

const update = asyncHandler(async (req, res) => {
  const data = await serviceService.updateService(req.store._id, req.params.id, req.body);
  return success(res, data, 'Service updated');
});

const remove = asyncHandler(async (req, res) => {
  const data = await serviceService.deleteService(req.store._id, req.params.id);
  return success(res, data, 'Service removed');
});

module.exports = { list, create, update, remove };
