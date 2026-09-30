import type { ApiResponse } from '../types/user';

export type MessageType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'QUOTATION';

export interface SendMessageRequest {
  type?: MessageType;
  content?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  type: MessageType;
  content: string;
  quotationId?: string | null;
  createdAt: string;
}

export interface ChatRoom {
  id: string;
  customerId: string;
  contractorId: string;
  requestId: string;
  lastMessage: string;
  lastMessageAt: string;
}

export type ChatRoomsResponse = ApiResponse<ChatRoom[]>;
export type ChatMessagesResponse = ApiResponse<ChatMessage[]>;
