const { asyncHandler } = require('../utils/asyncHandler');
const { success, created } = require('../utils/response');
const quotationService = require('../services/quotationService');

const create = asyncHandler(async (req, res) => {
  const data = await quotationService.createQuotation(req.user.id, req.body);
  return created(res, data, 'Quotation sent');
});

const getOne = asyncHandler(async (req, res) => {
  const data = await quotationService.getQuotation(req.params.id, req.user);
  return success(res, data, 'Quotation retrieved');
});

const listForRequest = asyncHandler(async (req, res) => {
  const data = await quotationService.listForRequest(req.params.requestId, req.user);
  return success(res, data, 'Quotations retrieved');
});

const accept = asyncHandler(async (req, res) => {
  const data = await quotationService.customerAction(req.params.id, req.user.id, 'accept');
  return success(res, data, 'Quotation accepted');
});

const reject = asyncHandler(async (req, res) => {
  const data = await quotationService.customerAction(req.params.id, req.user.id, 'reject');
  return success(res, data, 'Quotation declined');
});

const requestModification = asyncHandler(async (req, res) => {
  const data = await quotationService.customerAction(
    req.params.id,
    req.user.id,
    'modify',
    req.body.note
  );
  return success(res, data, 'Modification requested');
});

module.exports = { create, getOne, listForRequest, accept, reject, requestModification };
