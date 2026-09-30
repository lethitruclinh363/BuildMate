export type PaymentStatus = 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
export type PaymentType = 'FULL_PAYMENT' | 'DEPOSIT' | 'FINAL_PAYMENT';

export interface Payment {
  id: string;
  orderId: string;
  customerId: string;
  contractorId: string;
  amount: number;
  type: PaymentType;
  status: PaymentStatus;
  provider: string;
  transactionCode: string | null;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  refundedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  status: PaymentStatus;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  due?: number;
}

export interface OrderPaymentsPayload {
  summary: PaymentSummary;
  items: Payment[];
}

export interface CheckoutResult {
  payment: Payment;
  checkout?: { providerRef?: string; transactionCode?: string };
  commission?: CommissionPublic | null;
  duplicated?: boolean;
}

export interface CommissionPublic {
  id: string;
  paymentId: string;
  orderId: string;
  contractorId: string;
  rateSnapshot: number;
  platformAmount: number;
  contractorAmount: number;
  status: 'POSTED' | 'REVERSED';
  createdAt: string;
}

export interface EarningsPayload {
  totalRevenue: number;
  totalCommission: number;
  netEarning: number;
  transactions: CommissionPublic[];
}
