export function contractorQuoteSplit(totalAmount: number) {
  const total = Math.round(Number(totalAmount) || 0);
  const depositAmount = Math.round(total * 0.15);
  const platformFee = Math.round(total * 0.05);
  return {
    totalAmount: total,
    depositAmount,
    platformFee,
    contractorHold: depositAmount - platformFee,
    remainingAmount: total - depositAmount,
  };
}

export function isLegacyMaterialOrder(order: { depositRateSnapshot?: number; depositAmount?: number }) {
  return Number(order.depositRateSnapshot || 0) > 0 || Number(order.depositAmount || 0) > 0;
}
