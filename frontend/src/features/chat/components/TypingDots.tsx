import { useI18n } from '@/locales';

export function TypingDots({ name }: { name?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 text-xs text-ink-400">
      <span className="inline-flex gap-1 rounded-full bg-white px-3 py-2 shadow-card">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-navy-800"
            style={{ animationDelay: `${i * 0.12}s` }}
          />
        ))}
      </span>
      {name ? t('chat.typingName', { name }) : t('chat.typing')}
    </div>
  );
}
