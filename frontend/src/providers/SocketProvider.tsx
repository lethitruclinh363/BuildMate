import { io, type Socket } from 'socket.io-client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/context/AuthContext';
import type { AppNotification, ChatMessage } from '@/types/sprint4';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  onlineIds: Set<string>;
  notifications: AppNotification[];
  unread: number;
  prependNotification: (n: AppNotification) => void;
  setNotifications: (items: AppNotification[], unread: number) => void;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  onlineIds: new Set(),
  notifications: [],
  unread: 0,
  prependNotification: () => undefined,
  setNotifications: () => undefined,
});

function socketOrigin() {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (!apiUrl) return undefined;
  return apiUrl.replace(/\/api\/?$/, '');
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const { token, ready } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [notifications, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!ready || !token) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
      setItems([]);
      setUnread(0);
      setOnlineIds(new Set());
      return;
    }

    const instance = io(socketOrigin(), {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = instance;
    setSocket(instance);

    instance.on('connect', () => setConnected(true));
    instance.on('disconnect', () => setConnected(false));
    instance.on('user_online', ({ userId, online }: { userId: string; online: boolean }) => {
      setOnlineIds((prev) => {
        const next = new Set(prev);
        if (online) next.add(userId);
        else next.delete(userId);
        return next;
      });
    });
    instance.on('notification:new', (n: AppNotification) => {
      setItems((prev) => {
        if (n?.id && prev.some((item) => item.id === n.id)) return prev;
        if (!n?.isRead) setUnread((count) => count + 1);
        return [n, ...prev].slice(0, 40);
      });
    });

    return () => {
      instance.disconnect();
    };
  }, [token, ready]);

  const prependNotification = useCallback((n: AppNotification) => {
    setItems((prev) => [n, ...prev].slice(0, 40));
    setUnread((c) => c + 1);
  }, []);

  const setNotifications = useCallback((items: AppNotification[], count: number) => {
    setItems(items);
    setUnread(count);
  }, []);

  const value = useMemo(
    () => ({
      socket,
      connected,
      onlineIds,
      notifications,
      unread,
      prependNotification,
      setNotifications,
    }),
    [socket, connected, onlineIds, notifications, unread, prependNotification, setNotifications]
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  return useContext(SocketContext);
}

export function useRoomMessages(roomId: string | undefined, onMessage: (m: ChatMessage) => void) {
  const { socket } = useSocket();
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    if (!socket || !roomId) return;
    socket.emit('join_room', { roomId });
    const onReceive = (msg: ChatMessage) => {
      if (String(msg.roomId) === String(roomId)) handlerRef.current(msg);
    };
    socket.on('receive_message', onReceive);
    return () => {
      socket.off('receive_message', onReceive);
    };
  }, [socket, roomId]);
}
