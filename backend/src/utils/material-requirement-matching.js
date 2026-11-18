const { foldServiceName } = require('../constants/contractorServices');

function matchesRequirementItem(requirement, catalogItem) {
  const requiredName = foldServiceName(requirement.name || '').trim();
  const productName = foldServiceName(catalogItem.name || '').trim();
  if (!requiredName || !productName.includes(requiredName)) return false;

  const requiredSpecification = foldServiceName(requirement.specification || '').trim();
  const catalogDetails = foldServiceName(
    [catalogItem.name, catalogItem.description, catalogItem.sku].filter(Boolean).join(' ')
  );
  if (requiredSpecification && !catalogDetails.includes(requiredSpecification)) return false;

  const requiredUnit = foldServiceName(requirement.unit || '').trim();
  if (requiredUnit && requiredUnit !== foldServiceName(catalogItem.unit || '').trim()) return false;

  return true;
}

module.exports = { matchesRequirementItem };
