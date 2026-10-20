import { motion } from 'framer-motion';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordInput } from '@/components/common/PasswordInput';
import { getApiErrorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { getOtpCooldown, setOtpCooldown } from '@/lib/otp-cooldown';
import { PASSWORD_RE } from '@/lib/password';
import { useI18n } from '@/locales';
import { authApi } from '@/services/auth.api';
import { useToastStore } from '@/store/toast.store';

const fieldClass =
  'mt-1.5 w-full rounded-2xl border border-navy-800/12 bg-white px-4 py-3 text-sm text-navy-800 outline-none transition focus:border-copper-400 focus:ring-4 focus:ring-copper-400/20';

type FieldKey = 'password' | 'confirm';
type FieldStatus = 'idle' | 'error' | 'valid';

function fieldStatus(touched: boolean, message: string, hasValue: boolean): FieldStatus {
  if (!message && hasValue) return 'valid';
  if (touched && message) return 'error';
  return 'idle';
}

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const pushToast = useToastStore((s) => s.push);

  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);

  const [countdown, setCountdown] = useState(() => getOtpCooldown(''));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<Record<FieldKey, boolean>>({
    password: false,
    confirm: false,
  });

  const [error, setError] = useState('');
  const [otpError, setOtpError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  // Synchronize countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Check cooldown if email is updated/restored
  useEffect(() => {
    if (email.trim()) {
      const remaining = getOtpCooldown(email.trim());
      if (remaining > 0 && remaining !== countdown) {
        setCountdown(remaining);
      }
    }
  }, [email, countdown]);

  const passwordMessage = !password
    ? t('auth.passwordRequired')
    : PASSWORD_RE.test(password)
      ? ''
      : t('auth.passwordRule');
  const confirmMessage = !confirm
    ? t('auth.confirmRequired')
    : confirm === password
      ? ''
      : t('auth.passwordMismatch');

  const step2Valid = !passwordMessage && !confirmMessage;

  const passwordStatus = fieldStatus(touched.password, passwordMessage, Boolean(password));
  const confirmStatus = fieldStatus(touched.confirm, confirmMessage, Boolean(confirm));

  function markTouched(key: FieldKey) {
    setTouched((current) => ({ ...current, [key]: true }));
  }

  // TASK 1: Send OTP for email without changing screen
  async function handleSendCode(e?: FormEvent) {
    if (e) e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError(t('auth.emailRequired') || 'Vui lòng nhập email.');
      return;
    }
    setError('');
    setOtpError('');
    setInfo('');
    setLoading(true);
    try {
      const { data } = await authApi.forgotPassword(cleanEmail);
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : true;
      const body = sent === false ? t('auth.smtpMissing') : t('auth.checkInboxSpam');
      setInfo(body);
      setOtpSent(true);
      setOtpCooldown(cleanEmail, 60);
      setCountdown(60);
      pushToast({ kind: 'success', title: t('auth.codeSent'), body });
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.sendCodeFail'), body: message });
    } finally {
      setLoading(false);
    }
  }

  // TASK 2: Verify OTP
  async function handleVerifyOtp(e?: FormEvent) {
    if (e) e.preventDefault();
    if (code.length !== 6) return;
    setError('');
    setOtpError('');
    setLoading(true);
    try {
      await authApi.verifyResetCode(email.trim(), code.trim());
      setCodeVerified(true);
      pushToast({ kind: 'success', title: t('auth.codeValid') });
      setStep(2);
      setError('');
      setInfo('');
    } catch (err) {
      const message = getApiErrorMessage(err);
      setOtpError(message);
      pushToast({ kind: 'error', title: t('auth.otpWrong'), body: message });
    } finally {
      setLoading(false);
    }
  }

  // TASK 3: Resend OTP with 60s cooldown
  async function handleResendCode() {
    const cleanEmail = email.trim();
    if (resending || countdown > 0 || !cleanEmail) return;
    setError('');
    setOtpError('');
    setInfo('');
    setResending(true);
    try {
      const { data } = await authApi.forgotPassword(cleanEmail);
      const sent = data.data && 'emailSent' in data.data ? data.data.emailSent : true;
      const body = sent === false ? t('auth.smtpMissing') : t('auth.checkInboxSpam');
      setInfo(body);
      setCode('');
      setOtpCooldown(cleanEmail, 60);
      setCountdown(60);
      pushToast({ kind: 'info', title: t('auth.codeSent'), body });
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.sendCodeFail'), body: message });
    } finally {
      setResending(false);
    }
  }

  // Handle changing email when already sent
  function handleChangeEmail() {
    setOtpSent(false);
    setCode('');
    setOtpError('');
    setError('');
    setInfo('');
  }

  // TASK 5: Save new password (Step 2/2)
  async function handleSavePassword(e: FormEvent) {
    e.preventDefault();
    if (!codeVerified) {
      setStep(1);
      setError(t('auth.otpWrong'));
      return;
    }
    setError('');
    setTouched({ password: true, confirm: true });
    if (!step2Valid) {
      return;
    }
    setLoading(true);
    try {
      await authApi.resetPassword(email.trim(), code.trim(), password);
      pushToast({ kind: 'success', title: t('auth.passwordUpdated'), body: t('auth.loginWithNew') });
      navigate(`/login?email=${encodeURIComponent(email.trim())}`);
    } catch (err) {
      const message = getApiErrorMessage(err);
      setError(message);
      pushToast({ kind: 'error', title: t('auth.resetFail'), body: message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-[28px] border border-navy-800/8 bg-white p-7 shadow-lift"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">BuildMate</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.forgotTitle')}</h1>
      <p className="mt-2 text-sm text-ink-400">
        {t('auth.forgotStep', {
          step,
          label: step === 1 ? t('auth.stepEmailOtp') : t('auth.stepPassword'),
        })}
      </p>

      {error ? <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p> : null}
      {info && step === 1 && !otpSent ? (
        <p className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</p>
      ) : null}

      {/* BƯỚC 1/2: XÁC THỰC EMAIL & NHẬP OTP TRÊN CÙNG MỘT MÀN HÌNH */}
      {step === 1 ? (
        <div className="mt-6 space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="forgot-email" className="block text-sm font-medium text-navy-800">
                Email
              </label>
              {otpSent ? (
                <button
                  type="button"
                  onClick={handleChangeEmail}
                  className="text-xs font-semibold text-copper-500 hover:text-copper-600 transition"
                >
                  {t('auth.changeEmail')}
                </button>
              ) : null}
            </div>
            <input
              id="forgot-email"
              className={cn(fieldClass, otpSent && 'bg-paper-50 text-navy-600 cursor-not-allowed')}
              type="email"
              required
              disabled={otpSent || loading}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !otpSent) {
                  e.preventDefault();
                  void handleSendCode();
                }
              }}
              placeholder="example@buildmate.vn"
            />
          </div>

          {!otpSent ? (
            <button
              type="button"
              disabled={loading || !email.trim()}
              onClick={() => void handleSendCode()}
              className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 transition hover:bg-navy-700 disabled:opacity-60"
            >
              {loading ? t('auth.sendingCode') : t('auth.sendOtp')}
            </button>
          ) : (
            <div className="space-y-4 pt-1">
              {/* Thông báo kiểm tra email ngay dưới ô email */}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {t('auth.checkInboxSpam')}
              </div>

              {/* Ô OTP 6 số nằm ngay dưới thông báo */}
              <div>
                <label htmlFor="forgot-otp" className="block text-sm font-medium text-navy-800">
                  {t('auth.otpLabel')}
                </label>
                <input
                  id="forgot-otp"
                  className={cn(
                    fieldClass,
                    'text-center font-mono text-lg tracking-[0.35em]',
                    otpError && 'border-red-500 focus:border-red-500 focus:ring-red-400/20'
                  )}
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  placeholder="000000"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                    if (otpError) setOtpError('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && code.length === 6) {
                      e.preventDefault();
                      void handleVerifyOtp();
                    }
                  }}
                />
                {otpError ? <p className="mt-1.5 text-xs font-medium text-red-600">{otpError}</p> : null}
              </div>

              {/* Nút Xác nhận mã OTP */}
              <button
                type="button"
                disabled={loading || code.length !== 6}
                onClick={() => void handleVerifyOtp()}
                className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? t('auth.checkingCode') : t('auth.confirmOtp')}
              </button>

              {/* Nút Gửi lại mã kèm cooldown */}
              <button
                type="button"
                disabled={resending || countdown > 0 || !email.trim()}
                onClick={() => void handleResendCode()}
                className="flex h-11 w-full items-center justify-center rounded-full border border-navy-800/15 text-sm font-semibold text-navy-800 transition hover:bg-navy-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {resending
                  ? t('auth.resending')
                  : countdown > 0
                    ? t('auth.resendCooldown', { seconds: countdown })
                    : t('auth.resendCode') || t('auth.resend')}
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* BƯỚC 2/2: ĐẶT MẬT KHẨU MỚI (CHỈ HIỂN THỊ KHI ĐÃ XÁC MINH OTP HỢP LỆ) */}
      {step === 2 && codeVerified ? (
        <form className="mt-6 space-y-4" onSubmit={handleSavePassword} noValidate>
          <PasswordInput
            id="reset-password"
            label={t('auth.newPassword')}
            autoComplete="new-password"
            disabled={loading}
            value={password}
            error={passwordStatus === 'error' ? passwordMessage : undefined}
            valid={passwordStatus === 'valid'}
            onBlur={() => markTouched('password')}
            onChange={(e) => {
              setPassword(e.target.value);
              markTouched('password');
            }}
          />
          <PasswordInput
            id="reset-confirm"
            label={t('auth.confirmPassword')}
            autoComplete="new-password"
            disabled={loading}
            value={confirm}
            error={confirmStatus === 'error' ? confirmMessage : undefined}
            valid={confirmStatus === 'valid'}
            onBlur={() => markTouched('confirm')}
            onChange={(e) => {
              setConfirm(e.target.value);
              markTouched('confirm');
            }}
          />
          <button
            type="submit"
            disabled={loading || !step2Valid}
            className="flex h-12 w-full items-center justify-center rounded-full bg-navy-800 text-sm font-semibold text-paper-50 transition hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t('auth.saving') : t('auth.resetPassword')}
          </button>
        </form>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-400">
        <Link to="/login" className="font-semibold text-navy-800 hover:text-copper-500">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </motion.div>
  );
}
