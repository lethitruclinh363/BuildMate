export function formatVnd(value: number, locale = 'vi-VN') {
  return `${new Intl.NumberFormat(locale).format(value)}đ`;
}

export function isOpenOrderStatus(status: string) {
  return ['QUOTATION_ACCEPTED', 'DEPOSIT_PAID', 'STARTED', 'IN_PROGRESS', 'COMPLETED'].includes(status);
}
