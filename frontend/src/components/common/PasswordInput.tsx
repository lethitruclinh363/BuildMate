import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useI18n } from '@/locales';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string;
};

const fieldClass =
  'h-12 w-full rounded-2xl border border-navy-800/12 bg-white px-4 pr-12 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

/**
 * Ô mật khẩu dùng chung: click icon mắt để hiện / ẩn chữ.
 */
export function PasswordInput({ label, id, className, disabled, ...props }: PasswordInputProps) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const inputId = id || 'password-input';

  return (
    <label className="block text-sm font-medium text-navy-800" htmlFor={inputId}>
      {label}
      <span className="relative mt-1.5 block">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={cn(fieldClass, className)}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setVisible((open) => !open)}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-ink-400 hover:text-navy-800 disabled:opacity-40"
          aria-label={visible ? t('passwordField.hide') : t('passwordField.show')}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </span>
    </label>
  );
}
