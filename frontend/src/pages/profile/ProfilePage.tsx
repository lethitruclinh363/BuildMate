import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Camera, Eye, EyeOff, LockKeyhole, Mail, Phone, ShieldCheck, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Spinner } from '@/components/feedback/Spinner';
import { api, getApiErrorMessage, getApiErrorPayload } from '@/lib/api';
import { isValidVnMobile, normalizeVnMobile } from '@/lib/identity';
import { mediaUrl } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { useAuth } from '@/context/AuthContext';
import { useToastStore } from '@/store/toast.store';
import type { ApiResponse, User } from '@/types/user';

export function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { t, te } = useI18n();
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const token = useAuthStore((s) => s.token);
  const toast = useToastStore((s) => s.push);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(!user);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const applyUser = (next: User) => {
    if (token) setSession({ user: next, token });
    setName(next.name);
    setPhone(next.phone ?? '');
  };

  const load = () => {
    setLoading(true);
    setError(null);
    api
      .get<ApiResponse<User>>('/user/profile')
      .then((res) => applyUser(res.data.data))
      .catch((err) => setError(te(getApiErrorMessage(err))))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <Spinner />;
  if (error || !user) return <ErrorState body={error || undefined} onRetry={load} />;

  const save = async () => {
    const nextPhone = normalizeVnMobile(phone);
    if (phone && !isValidVnMobile(nextPhone)) {
      setPhoneError(t('auth.phoneInvalid'));
      return;
    }
    setSaving(true);
    setPhoneError('');
    try {
      const { data } = await api.patch<ApiResponse<User>>('/user/profile', { name, phone: nextPhone || phone });
      applyUser(data.data);
      toast({ kind: 'success', title: t('feedback.saved') });
    } catch (err) {
      const payload = getApiErrorPayload(err);
      const message = te(payload.message);
      if (payload.fields.includes('phone') || payload.code === 'PHONE_ALREADY_EXISTS') {
        setPhoneError(t('auth.phoneTaken'));
      }
      toast({ kind: 'error', title: message });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (currentPassword.length < 8 || !passwordIsValid || newPassword !== confirmPassword) return;

    setPwdBusy(true);
    try {
      await api.patch('/user/password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast({ kind: 'success', title: t('feedback.passwordChanged') });
      await logout();
      navigate(`/login?email=${encodeURIComponent(user.email)}`, { replace: true });
    } catch (err) {
      toast({ kind: 'error', title: te(getApiErrorMessage(err)) });
    } finally {
      setPwdBusy(false);
    }
  };

  const passwordIsValid =
    newPassword.length >= 8 &&
    newPassword.length <= 72 &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword);

  const onAvatar = async (file?: File) => {
    if (!file) return;
    const form = new FormData();
    form.append('avatar', file);
    try {
      const { data } = await api.post<ApiResponse<User>>('/user/avatar', form, { timeout: 60000 });
      applyUser(data.data);
      toast({ kind: 'success', title: t('feedback.avatarUpdated') });
    } catch (err) {
      toast({ kind: 'error', title: te(getApiErrorMessage(err)) });
    }
  };

  return (
    <PageTransition>
      <PageHeader eyebrow={t('profile.eyebrow')} title={t('profile.title')} description={t('profile.desc')} />
      <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card hover={false} className="overflow-hidden p-0">
          <div className="h-24 bg-gradient-to-r from-navy-800 via-[#173b56] to-[#2d6171]" />
          <div className="px-5 pb-5">
            <div className="-mt-12 flex items-end justify-between">
              <button
                type="button"
                className="group relative rounded-full p-1"
                onClick={() => fileRef.current?.click()}
                aria-label={t('profile.changeAvatar')}
              >
                <Avatar
                  name={user.name}
                  src={mediaUrl(user.avatar)}
                  size="lg"
                  className="h-24 w-24 border-4 border-white text-2xl shadow-md"
                />
                <span className="absolute inset-1 grid place-items-center rounded-full bg-navy-900/0 text-white opacity-0 transition group-hover:bg-navy-900/45 group-hover:opacity-100 group-focus-visible:bg-navy-900/45 group-focus-visible:opacity-100">
                  <Camera className="h-6 w-6" />
                </span>
              </button>
              <Badge className="mb-2" tone={user.status === 'ACTIVE' ? 'success' : 'warn'}>
                {labeled(t, 'status', user.status)}
              </Badge>
            </div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-copper-500">{t('profile.avatar')}</p>
            <h2 className="mt-1 break-words font-display text-2xl font-semibold text-navy-800">{user.name}</h2>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-ink-500">
              <Mail className="h-4 w-4 shrink-0" />
              <span className="truncate">{user.email}</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                void onAvatar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <Button className="mt-4 w-full" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
              <Camera className="h-4 w-4" />
              {t('profile.changeAvatar')}
            </Button>
            <div className="mt-5 space-y-3 rounded-xl bg-mist-100/70 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
                <ShieldCheck className="h-4 w-4 text-copper-500" />
                {t('profile.status')}
              </p>
              <div className="flex items-start gap-3 text-sm text-ink-600">
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                <span>{labeled(t, 'role', user.role)}</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-ink-600">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                <span>{t('profile.memberSince', { date: new Date(user.createdAt || Date.now()).toLocaleDateString() })}</span>
              </div>
              {user.phone ? (
                <div className="flex items-start gap-3 text-sm text-ink-600">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
                  <span>{user.phone}</span>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card hover={false} className="md:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-copper-400/15 text-copper-600">
                <UserRound className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-navy-800">{t('profile.info')}</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                id="name"
                label={user.role === 'MATERIAL_STORE_OWNER' ? t('profile.ownerName') : t('profile.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                id="phone"
                label={t('profile.phone')}
                value={phone}
                error={phoneError}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneError('');
                }}
              />
              <Input id="email" label={t('profile.email')} value={user.email} disabled />
              <Input id="role" label={t('profile.role')} value={labeled(t, 'role', user.role)} disabled />
            </div>
            <div className="mt-5 flex justify-end border-t border-navy-800/8 pt-4">
              <Button loading={saving} onClick={() => void save()}>
                {t('profile.saveProfile')}
              </Button>
            </div>
          </Card>
          <Card hover={false} className="md:p-6">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-800/5 text-navy-800">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-semibold text-navy-800">{t('profile.password')}</h2>
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="relative">
                <Input
                  id="current"
                  type={showCurrentPassword ? 'text' : 'password'}
                  label={t('profile.currentPassword')}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={showCurrentPassword ? t('profile.hidePassword') : t('profile.showPassword')}
                  className="absolute right-3 top-[42px] text-ink-500 transition hover:text-navy-800"
                  onClick={() => setShowCurrentPassword((v) => !v)}
                >
                  {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <div className="relative">
                <Input
                  id="next"
                  type={showNewPassword ? 'text' : 'password'}
                  label={t('profile.newPassword')}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="pr-12"
                  maxLength={72}
                  hint={t('profile.passwordRequirements')}
                  error={newPassword.length > 0 && !passwordIsValid ? t('profile.passwordRequirements') : undefined}
                />
                <button
                  type="button"
                  aria-label={showNewPassword ? t('profile.hidePassword') : t('profile.showPassword')}
                  className="absolute right-3 top-[42px] text-ink-500 transition hover:text-navy-800"
                  onClick={() => setShowNewPassword((v) => !v)}
                >
                  {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>

              <div className="relative sm:col-start-2">
                <Input
                  id="confirm"
                  type={showConfirmPassword ? 'text' : 'password'}
                  label={t('profile.confirmPassword')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pr-12"
                  maxLength={72}
                  error={
                    confirmPassword.length > 0 && confirmPassword !== newPassword
                      ? t('profile.passwordMismatch')
                      : undefined
                  }
                />
                <button
                  type="button"
                  aria-label={showConfirmPassword ? t('profile.hidePassword') : t('profile.showPassword')}
                  className="absolute right-3 top-[42px] text-ink-500 transition hover:text-navy-800"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                >
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            <div className="mt-5 flex justify-end border-t border-navy-800/8 pt-4">
              <Button
                className="disabled:bg-navy-800 disabled:text-paper-50 disabled:opacity-100"
                loading={pwdBusy}
                disabled={
                  currentPassword.length < 8 ||
                  !passwordIsValid ||
                  !confirmPassword ||
                  newPassword !== confirmPassword
                }
                onClick={() => void changePassword()}
              >
                {t('profile.updatePassword')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
