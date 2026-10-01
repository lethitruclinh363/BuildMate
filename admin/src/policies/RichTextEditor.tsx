import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const ready = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (!ready.current || document.activeElement !== node) {
      if (node.innerHTML !== value) node.innerHTML = value || '';
      ready.current = true;
    }
  }, [value]);

  function format(command: string, commandValue?: string) {
    ref.current?.focus();
    document.execCommand(command, false, commandValue);
    onChange(ref.current?.innerHTML || '');
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{t('policy.content')}</span>
      <div className="flex flex-wrap gap-2">
        <ToolbarButton label={t('policy.bold')} onClick={() => format('bold')} />
        <ToolbarButton label={t('policy.italic')} onClick={() => format('italic')} />
        <ToolbarButton label={t('policy.heading')} onClick={() => format('formatBlock', 'h2')} />
        <ToolbarButton label={t('policy.list')} onClick={() => format('insertUnorderedList')} />
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        className="min-h-52 rounded-xl border border-white/12 bg-navy-950/60 px-3.5 py-3 text-sm leading-relaxed text-white outline-none focus:border-copper-500/60 [&_h2]:mb-2 [&_h2]:font-display [&_h2]:text-xl [&_ul]:list-disc [&_ul]:pl-5"
        onInput={() => onChange(ref.current?.innerHTML || '')}
      />
    </div>
  );
}

function ToolbarButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-white/70 hover:border-copper-500/40 hover:text-copper-300"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
