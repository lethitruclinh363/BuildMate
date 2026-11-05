import { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { mediaUrl } from '@/lib/utils';

function isPdf(url?: string) {
  return Boolean(url && url.toLowerCase().split('?')[0].endsWith('.pdf'));
}

export function PartnerMediaImage({
  url,
  alt = '',
  label,
  className = 'h-28 w-full object-cover',
  plain = false,
}: {
  url?: string;
  alt?: string;
  label?: string;
  className?: string;
  plain?: boolean;
}) {
  const src = mediaUrl(url);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const placeholder = (
    <div className={`grid place-items-center bg-[#F8FAFC] text-[#94A3B8] ${className}`}>
      {isPdf(url) ? <span className="text-xs font-semibold text-[#2B6280]">PDF</span> : <ImageOff className="h-5 w-5" />}
    </div>
  );

  const media = !src || failed || isPdf(url) ? (
    placeholder
  ) : (
    <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />
  );

  if (plain) return media;

  return (
    <figure className="overflow-hidden rounded-xl border border-[#E1E7ED] bg-white">
      {media}
      {label ? <figcaption className="px-3 py-2 text-xs text-[#526477]">{label}</figcaption> : null}
    </figure>
  );
}
