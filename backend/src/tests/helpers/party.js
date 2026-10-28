const { ROLES, USER_STATUS } = require('../../models/user.model');
const { REPAIR_CATEGORY, REQUEST_STATUS } = require('../../models/RepairRequest');
const { QUOTE_ITEM_TYPE, QUOTATION_STATUS } = require('../../models/Quotation');
const { userRepository } = require('../../repositories/userRepository');
const { RepairRequest, Quotation } = require('../../repositories/conversationAccess');
const { signToken } = require('../../services/authService');
const { assertTestDatabase, deleteFixtureUsers } = require('./pg-cleanup');

async function createUser(fields) {
  assertTestDatabase();
  if (!String(fields.email || '').toLowerCase().endsWith('@buildmate.test')) {
    throw new Error('Test fixtures must use an @buildmate.test email');
  }
  return userRepository.create({
    status: USER_STATUS.ACTIVE,
    emailVerified: true,
    ...fields,
  });
}

async function createParty(stamp = Date.now(), { totalCost = 750000 } = {}) {
  const customer = await createUser({
    name: 'E2E Customer',
    email: `e2e.customer.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CUSTOMER,
  });
  const contractor = await createUser({
    name: 'E2E Contractor',
    email: `e2e.contractor.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CONTRACTOR,
  });
  const stranger = await createUser({
    name: 'E2E Stranger',
    email: `e2e.stranger.${stamp}@buildmate.test`,
    password: 'Demo@1234',
    role: ROLES.CUSTOMER,
  });

  const request = await RepairRequest.create({
    customerId: customer._id,
    contractorId: contractor._id,
    category: REPAIR_CATEGORY.PLUMBING,
    title: `E2E leak ${stamp}`,
    description: 'Sprint 5.3 fixture request for the locked quotation-to-order flow.',
    address: '12 Nguyen Van Cu, Ninh Kieu',
    status: REQUEST_STATUS.ACCEPTED,
  });

  const quotation = await Quotation.create({
    requestId: request._id,
    customerId: customer._id,
    contractorId: contractor._id,
    items: [{ type: QUOTE_ITEM_TYPE.LABOR, name: 'Pipe repair', quantity: 1, unit: 'JOB', price: totalCost }],
    materialCost: 0,
    laborCost: totalCost,
    transportCost: 0,
    totalCost,
    estimatedDays: 1,
    status: QUOTATION_STATUS.SENT,
  });

  return {
    customer,
    contractor,
    stranger,
    request,
    quotation,
    tokens: {
      customer: signToken(customer),
      contractor: signToken(contractor),
      stranger: signToken(stranger),
    },
    ids: [customer._id, contractor._id, stranger._id],
  };
}

async function cleanupParty(party) {
  if (!party) return;
  await deleteFixtureUsers(party.ids || [party.customer?._id, party.contractor?._id, party.stranger?._id]);
}

module.exports = { createUser, createParty, cleanupParty, deleteFixtureUsers, ROLES, USER_STATUS };
