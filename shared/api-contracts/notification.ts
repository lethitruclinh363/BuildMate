import type { ApiResponse } from '../types/user';
import type { AppNotification } from '../types/notification';

export type NotificationListResponse = ApiResponse<{
  items: AppNotification[];
  unread: number;
  total?: number;
  page?: number;
}>;
