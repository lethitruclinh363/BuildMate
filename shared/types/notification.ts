export type NotificationType =
  | 'REQUEST'
  | 'MESSAGE'
  | 'QUOTATION'
  | 'QUOTATION_ACCEPTED'
  | 'QUOTATION_REJECTED'
  | 'QUOTATION_MODIFY'
  | 'STATUS_UPDATE'
  | 'ORDER_CREATED'
  | 'PROGRESS_UPDATED'
  | 'ORDER_COMPLETED'
  | 'CONTRACTOR_ACCEPTED_JOB'
  | 'CONTRACTOR_STARTED_JOB'
  | 'CONTRACTOR_UPDATED_PROGRESS'
  | 'CONTRACTOR_COMPLETED_JOB';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType | string;
  isRead: boolean;
  link: string;
  meta?: Record<string, unknown>;
  createdAt: string;
}
