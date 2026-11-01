import { normalizeMrlUnit } from '@/lib/mrl-display';

export const MRL_CHAT_MARKER = '[[BM:MRL]]';

export type MrlChatKind = 'MRL_REQUEST' | 'MRL_QUOTE' | 'MRL_CONFIRMED' | 'MRL_REJECTED' | 'MRL_PROGRESS';

export type MrlChatPayload = {
  v?: number;
  kind: MrlChatKind;
  listId: string;
  requestCode?: string;
  requestId?: string;
  title?: string;
  address?: string;
  storeName?: string;
  customerName?: string;
  status?: string;
  deliveryFee?: number;
  note?: string;
  total?: number;
  legacy?: boolean;
  items?: Array<{
    name: string;
    specification?: string;
    unit?: string;
    quantity: number;
    notes?: string;
    unitPrice?: number;
  }>;
};

function parseLooseMrlChat(content: string): MrlChatPayload | null {
  const match = content.match(/Material list\s+([a-f0-9]{24})\b/i);
  if (!match) return null;
  const rest = content.slice(match.index! + match[0].length);
  const items = rest
    .split(/\s[-–—]\s/)
    .map((part) => part.replace(/^[\s:-]+/, '').trim())
    .filter(Boolean)
    .map((part) => {
      const pieces = part.split('|').map((item) => item.trim()).filter(Boolean);
      const name = pieces[0] || part;
      const qtyUnit = pieces[1] || '';
      const qtyMatch = qtyUnit.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
      return {
        name,
        quantity: qtyMatch ? Number(qtyMatch[1].replace(',', '.')) : 0,
        unit: normalizeMrlUnit(qtyMatch ? qtyMatch[2] : ''),
        specification: pieces[2] || '',
        notes: '',
      };
    });
  return {
    v: 1,
    kind: 'MRL_REQUEST',
    listId: match[1],
    items,
    legacy: true,
  };
}

export function parseMrlChat(content?: string): MrlChatPayload | null {
  const raw = String(content || '');
  if (raw.startsWith(MRL_CHAT_MARKER)) {
    const start = raw.indexOf('{');
    if (start >= 0) {
      try {
        const payload = JSON.parse(raw.slice(start)) as MrlChatPayload;
        if (payload?.kind && payload?.listId) {
          if (Array.isArray(payload.items)) {
            payload.items = payload.items.map((item) => ({
              ...item,
              unit: normalizeMrlUnit(item.unit),
            }));
          }
          return payload;
        }
      } catch {
        /* fall through */
      }
    }
  }
  return parseLooseMrlChat(raw);
}

export function mrlChatPreview(content?: string) {
  const raw = String(content || '');
  if (raw.startsWith(MRL_CHAT_MARKER)) {
    return raw.split('\n')[0].replace(MRL_CHAT_MARKER, '').trim() || 'Material list';
  }
  const parsed = parseMrlChat(raw);
  if (parsed?.kind === 'MRL_QUOTE') return 'Material quote';
  if (parsed?.kind === 'MRL_CONFIRMED') return 'Material quote confirmed';
  if (parsed?.kind === 'MRL_REJECTED') return 'Material quote rejected';
  if (parsed?.kind === 'MRL_PROGRESS') return parsed.status || 'Material list';
  if (parsed) return 'Material quote request';
  return raw;
}
