import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ImagePlus, MapPin, Send } from 'lucide-react';
import { BackButton } from '@/components/navigation/BackButton';
import { PageTransition } from '@/components/motion/PageTransition';
import { DashboardSkeleton } from '@/components/dashboard/Skeleton';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { LocationMessage } from '@/features/chat/components/LocationMessage';
import { SendLocationModal, type ChatLocationDraft } from '@/features/chat/components/SendLocationModal';
import { TypingDots } from '@/features/chat/components/TypingDots';
import { chatApi } from '@/features/chat/services/sprint4.api';
import { QuotationCard } from '@/features/quotation/components/QuotationCard';
import { getApiErrorMessage } from '@/lib/api';
import { mediaUrl } from '@/lib/partner-api';
import { useRoomMessages, useSocket } from '@/providers/SocketProvider';
import { useAuthStore } from '@/store/auth.store';
import { canCreateQuotation, type ChatMessage, type ChatRoom } from '@/types/sprint4';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

export function ChatPage() {
  const { t, te } = useI18n();
  const { roomId } = useParams();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { socket, onlineIds } = useSocket();
  const [room, setRoom] = useState<ChatRoom | null>(null);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [locationOpen, setLocationOpen] = useState(false);
  const [sendingLocation, setSendingLocation] = useState(false);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | undefined>(undefined);
  const sendingText = useRef(false);
  const sendingFile = useRef(false);

  const isCustomer = user?.role === 'CUSTOMER';
  const chatBase =
    user?.role === 'MATERIAL_STORE_OWNER' ? '/store/chat' : isCustomer ? '/customer/chat' : '/contractor/chat';
  const [trackId, setTrackId] = useState(roomId);
  if (trackId !== roomId) {
    setTrackId(roomId);
    setLoading(true);
    setError(null);
    if (!roomId) {
      setRoom(null);
      setMessages([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const listRes = await chatApi.rooms();
        if (cancelled) return;
        setRooms(listRes.data.data);
        if (!roomId) {
          setRoom(null);
          setMessages([]);
          return;
        }
        const [r, m] = await Promise.all([chatApi.room(roomId), chatApi.messages(roomId)]);
        if (cancelled) return;
        setRoom(r.data.data);
        setMessages(m.data.data);
      } catch (err) {
        if (!cancelled) setError(te(getApiErrorMessage(err)));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

  useRoomMessages(roomId, (msg) => {
    setMessages((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]));
  });

  useEffect(() => {
    if (!socket || !roomId) return;
    const onTyping = (p: { roomId: string; userId: string; name: string; isTyping: boolean }) => {
      if (p.roomId !== roomId || p.userId === user?.id) return;
      setTypingName(p.isTyping ? p.name : null);
    };
    socket.on('typing', onTyping);
    return () => {
      socket.off('typing', onTyping);
    };
  }, [socket, roomId, user?.id]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, typingName]);

  const other = useMemo(() => {
    if (!room || !user) return null;
    return isCustomer ? room.contractor : room.customer;
  }, [room, user, isCustomer]);

  const otherOnline = other
    ? onlineIds.has(String(other.id)) ||
      (isCustomer ? room?.contractorOnline : room?.customerOnline)
    : false;

  const emitTyping = (isTyping: boolean) => {
    if (!socket || !roomId) return;
    socket.emit('typing', { roomId, isTyping });
  };

  const sendText = async () => {
    const content = text.trim();
    if (!content || !roomId || sendingText.current) return;
    sendingText.current = true;
    setText('');
    emitTyping(false);
    try {
      const { data } = await chatApi.send(roomId, content);
      setMessages((prev) => (prev.some((p) => p.id === data.data.id) ? prev : [...prev, data.data]));
    } catch (err) {
      setText(content);
      setError(te(getApiErrorMessage(err)));
    } finally {
      sendingText.current = false;
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void sendText();
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendText();
    } else {
      emitTyping(true);
      if (typingTimer.current) window.clearTimeout(typingTimer.current);
      typingTimer.current = window.setTimeout(() => emitTyping(false), 1200);
    }
  };

  const sendLocation = async (location: ChatLocationDraft) => {
    if (!roomId || sendingLocation) return;
    setSendingLocation(true);
    try {
      const { data } = await chatApi.sendLocation(roomId, location);
      setMessages((prev) => (prev.some((item) => item.id === data.data.id) ? prev : [...prev, data.data]));
      setLocationOpen(false);
    } catch (err) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      setSendingLocation(false);
    }
  };

  const onFile = async (file?: File) => {
    if (!file || !roomId || sendingFile.current) return;
    sendingFile.current = true;
    try {
      const { data } = await chatApi.media(roomId, file);
      setMessages((prev) => (prev.some((item) => item.id === data.data.id) ? prev : [...prev, data.data]));
    } catch (err) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      sendingFile.current = false;
    }
  };

  const isStoreRoom = room?.roomKind === 'CUSTOMER_MATERIAL_STORE';

  if (loading) return <DashboardSkeleton />;
  if (error) {
    return <ErrorState body={error} onRetry={() => window.location.reload()} />;
  }
  if (roomId && (!room || !other)) {
    return <ErrorState body={t('errors.api.Chat room not found')} onRetry={() => window.location.reload()} />;
  }

  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-7.5rem)] min-h-[28rem] overflow-hidden rounded-[22px] border border-navy-800/8 bg-paper-50 shadow-card">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-navy-800/8 bg-white md:block">
          <p className="px-4 py-4 font-display text-lg text-navy-800">{t('chat.conversations')}</p>
          {rooms.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-ink-400">{t('chat.emptyInbox')}</p>
          ) : (
          rooms.map((item) => {
            const peer = item.otherUser;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(`${chatBase}/${item.id}`)}
                className={cn(
                  'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-paper-100',
                  item.id === roomId && 'bg-copper-50'
                )}
              >
                <Avatar name={peer?.name || t('chat.crewFallback')} src={peer?.avatar} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-navy-800">
                    {peer?.name || t('chat.crewFallback')}
                  </span>
                  <span className="block truncate text-xs text-ink-400">{item.lastMessage}</span>
                </span>
              </button>
            );
          })
          )}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-navy-800/8 bg-white px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <BackButton
                fallback={
                  user?.role === 'CONTRACTOR'
                    ? '/contractor/requests'
                    : user?.role === 'MATERIAL_STORE_OWNER'
                      ? '/store/chat'
                      : '/customer/chat'
                }
                className="mb-0 md:hidden"
              />
              {other ? <Avatar name={other.name} src={other.avatar} /> : null}
              <div>
                <p className="font-display text-lg text-navy-800">{other?.name || t('chat.conversations')}</p>
                <p className="text-xs text-ink-400">
                  <span
                    className={cn(
                      'mr-1 inline-block h-2 w-2 rounded-full',
                      otherOnline ? 'bg-emerald-500' : 'bg-ink-200'
                    )}
                  />
                  {other ? (otherOnline ? t('chat.online') : t('chat.offline')) : t('chat.pickConversation')}
                  {isStoreRoom ? ` · ${t('chat.storeChat')}` : room?.request?.title ? ` · ${room.request.title}` : ''}
                </p>
              </div>
            </div>
            {user?.role === 'CONTRACTOR' && !isStoreRoom && canCreateQuotation(room?.request?.status) ? (
              <Button asChild size="sm" variant="copper">
                <Link to={`/contractor/quotation/create/${room.requestId}`}>{t('chat.createQuote')}</Link>
              </Button>
            ) : null}
          </header>

          <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {!room ? (
              <p className="px-2 py-10 text-center text-sm text-ink-400">{t('chat.pickConversation')}</p>
            ) : null}
            {room?.request?.images?.[0] ? (
              <div className="mx-auto max-w-md rounded-2xl bg-white p-3 text-center shadow-card">
                <p className="text-xs uppercase tracking-[0.16em] text-copper-600">{t('chat.sitePhotos')}</p>
                <img
                  src={mediaUrl(room.request.images[0])}
                  alt=""
                  className="mt-2 h-40 w-full rounded-xl object-cover"
                />
                <p className="mt-2 text-sm text-ink-600">{room.request.description}</p>
              </div>
            ) : null}
            {messages.map((msg) => {
              const mine = String(msg.senderId) === String(user?.id);
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex', mine ? 'justify-end' : 'justify-start')}
                >
                  {msg.type === 'LOCATION' && msg.location ? (
                    <LocationMessage location={msg.location} />
                  ) : msg.type === 'QUOTATION' && msg.quotation ? (
                    <div className="w-full max-w-sm">
                      <QuotationCard
                        quote={msg.quotation}
                        compact
                        href={
                          isCustomer
                            ? `/customer/quotation/${msg.quotation.id}`
                            : `/contractor/quotation/create/${msg.quotation.requestId}`
                        }
                      />
                    </div>
                  ) : (
                    <div
                      className={cn(
                        'max-w-[75%] rounded-3xl px-4 py-2.5 text-sm shadow-card',
                        mine ? 'rounded-br-md bg-navy-800 text-white' : 'rounded-bl-md bg-white text-ink-800'
                      )}
                    >
                      {msg.type === 'IMAGE' ? (
                        <img src={mediaUrl(msg.content)} alt="" loading="lazy" decoding="async" className="max-h-56 rounded-2xl" />
                      ) : msg.type === 'VIDEO' ? (
                        <video src={mediaUrl(msg.content)} controls className="max-h-56 rounded-2xl" />
                      ) : (
                        msg.content
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
            {typingName ? <TypingDots name={typingName} /> : null}
          </div>

          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-navy-800/8 bg-white p-3">
            {!room ? (
              <p className="w-full py-2 text-center text-sm text-ink-400">{t('chat.pickConversation')}</p>
            ) : (
            <>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-paper-100 px-3 text-sm font-semibold text-navy-800"
              onClick={() => setLocationOpen(true)}
            >
              <MapPin className="h-4 w-4" /> {t('chat.sendLocation')}
            </button>
            <label className="grid h-11 w-11 cursor-pointer place-items-center rounded-full bg-paper-100 text-navy-800">
              <ImagePlus className="h-4 w-4" />
              <input
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder={isStoreRoom ? t('chat.storePlaceholder') : t('chat.placeholder')}
              className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-navy-800/10 px-4 py-2.5 text-sm outline-none focus:ring-4 focus:ring-navy-500/10"
            />
            <Button type="submit" size="icon" disabled={!text.trim()} aria-label={t('chat.sendMessage')}>
              <Send className="h-4 w-4" />
            </Button>
            </>
            )}
          </form>
          <SendLocationModal
            open={locationOpen}
            busy={sendingLocation}
            onOpenChange={setLocationOpen}
            onSend={(location) => void sendLocation(location)}
          />
        </section>
      </div>
    </PageTransition>
  );
}
