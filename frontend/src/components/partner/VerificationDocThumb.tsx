import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { mediaUrl } from '@/lib/partner-api';
import type { VerificationDocument } from '@/types/partner';

export function isPrivateVerificationUrl(url?: string) {
  return Boolean(url && url.startsWith('private:'));
}

export function VerificationDocThumb({
  doc,
  kind,
  className,
}: {
  doc: VerificationDocument;
  kind: 'contractor' | 'store';
  className?: string;
}) {
  const [src, setSrc] = useState('');
  const box = className || 'h-12 w-12 rounded-xl object-cover';

  useEffect(() => {
    if (!doc.mimeType?.startsWith('image/')) return undefined;
    if (!isPrivateVerificationUrl(doc.url)) {
      setSrc(mediaUrl(doc.url));
      return undefined;
    }
    const prefix = kind === 'store' ? '/material-store' : '/contractor';
    let blobUrl = '';
    let cancelled = false;
    api
      .get<Blob>(`${prefix}/verification/documents/${doc._id}/file`, { responseType: 'blob' })
      .then((response) => {
        blobUrl = URL.createObjectURL(response.data);
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        setSrc(blobUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [doc._id, doc.url, doc.mimeType, kind]);

  if (!doc.mimeType?.startsWith('image/')) {
    return (
      <span className={`flex items-center justify-center bg-paper-100 text-[10px] font-semibold text-navy-800 ${box}`}>
        PDF
      </span>
    );
  }
  if (!src) return <span className={`inline-block bg-paper-100 ${box}`} />;
  return <img src={src} alt="" className={box} />;
}
