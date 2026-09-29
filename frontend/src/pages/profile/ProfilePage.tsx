import { useEffect, useRef, useState } from 'react';
import { Camera, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { PageTransition } from '@/components/motion/PageTransition';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { ErrorState } from '@/components/feedback/ErrorState';
import { Spinner } from '@/components/feedback/Spinner';
import { api, getApiErrorMessage } from '@/lib/api';
import { mediaUrl } from '@/lib/partner-api';
import { labeled, useI18n } from '@/locales';
import { useAuthStore } from '@/store/auth.store';
import { useToastStore } from '@/store/toast.store';
import type { ApiResponse, User } from '@/types/user';

export function ProfilePage() {
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
    setSaving(true);
    try {
      const { data } = await api.patch<ApiResponse<User>>('/user/profile', { name, phone });
      applyUser(data.data);
      toast({ kind: 'success', title: t('feedback.saved') });
    } catch (err) {
      toast({ kind: 'error', title: te(getApiErrorMessage(err)) });
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
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <Card hover={false} className="text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-copper-500">{t('profile.avatar')}</p>
          <div className="mt-4 flex justify-center">
            <Avatar name={user.name} src={mediaUrl(user.avatar)} size="lg" />
          </div>
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
          <Button className="mt-4" size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
            <Camera className="h-4 w-4" />
            {t('profile.changeAvatar')}
          </Button>
          <div className="mt-6 rounded-2xl bg-paper-100 p-4 text-left">
            <p className="flex items-center gap-2 text-sm font-semibold text-navy-800">
              <ShieldCheck className="h-4 w-4 text-copper-500" />
              {t('profile.status')}
            </p>
            <Badge className="mt-2" tone={user.status === 'ACTIVE' ? 'success' : 'warn'}>
              {labeled(t, 'status', user.status)}
            </Badge>
            <p className="mt-2 text-xs text-ink-400">{labeled(t, 'role', user.role)}</p>
            <p className="mt-1 text-xs text-ink-400">
              {t('profile.memberSince', { date: new Date(user.createdAt || Date.now()).toLocaleDateString() })}
            </p>
          </div>
        </Card>

        <div className="space-y-6">
          <Card hover={false}>
            <h2 className="font-display text-xl text-navy-800">{t('profile.info')}</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                id="name"
                label={user.role === 'MATERIAL_STORE_OWNER' ? t('profile.ownerName') : t('profile.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input id="phone" label={t('profile.phone')} value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input id="email" label={t('profile.email')} value={user.email} disabled />
              <Input id="role" label={t('profile.role')} value={labeled(t, 'role', user.role)} disabled />
            </div>
            <Button className="mt-4" loading={saving} onClick={() => void save()}>
              {t('profile.saveProfile')}
            </Button>
          </Card>
          <Card hover={false}>
            <h2 className="font-display text-xl text-navy-800">{t('profile.password')}</h2>
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

              <div className="relative">
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
            <Button
              className="mt-4"
              variant="copper"
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
          </Card>
        </div>
      </div>
    </PageTransition>
  );
}
