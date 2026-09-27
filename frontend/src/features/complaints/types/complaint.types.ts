export type ComplaintStatus = 'OPEN' | 'PROCESSING' | 'RESOLVED' | 'REJECTED';

export interface Complaint {
  id: string;
  orderId: string;
  createdBy: string;
  againstUser: string;
  reason: string;
  description: string;
  attachments: string[];
  status: ComplaintStatus;
  adminNote: string;
  adminId: string | null;
  createdAt: string;
  updatedAt: string;
}
