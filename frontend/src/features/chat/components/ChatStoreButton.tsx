import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { chatApi } from '@/features/chat/services/sprint4.api';
import { getApiErrorMessage } from '@/lib/api';
import { useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { storeProfilePath } from '@/lib/partner-paths';
import { withAuthRedirect } from '@/types/sprint4';

export function ChatStoreButton({
  storeId,
  variant = 'outline',
}: {
  storeId: string;
  variant?: 'outline' | 'copper' | 'ghost';
}) {
  const { t, te } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const role = useAuthStore((state) => state.user?.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (role && role !== 'CUSTOMER') return null;

  async function openChat() {
    const next = `${location.pathname}${location.search}`;
    if (role !== 'CUSTOMER') {
      navigate(withAuthRedirect(next || storeProfilePath(storeId, role), role));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await chatApi.openStoreRoom(storeId);
      navigate(`/customer/chat/${res.data.data.id}`);
    } catch (err: unknown) {
      setError(te(getApiErrorMessage(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-1">
      <Button type="button" variant={variant} disabled={busy} onClick={() => void openChat()}>
        <MessageSquare className="h-4 w-4" /> {t('chat.chatStore')}
      </Button>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
