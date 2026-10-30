import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useI18n } from '@/locales';
import { homeForRole, useAuthStore } from '@/store/auth.store';
import type { ApiResponse, AuthPayload } from '@/types/user';

type FormValues = { email: string; password: string; remember?: boolean };

export function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [serverError, setServerError] = useState('');
  const { t, te } = useI18n();

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t('auth.invalidEmail')),
        password: z.string().min(1, t('auth.passwordRequired')),
        remember: z.boolean().optional(),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: true },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError('');
    try {
      const { data } = await api.post<ApiResponse<AuthPayload>>('/auth/login', {
        email: values.email,
        password: values.password,
      });
      const home = homeForRole(data.data.user.role);
      if (home === '/login') {
        setServerError(t('auth.loginFail'));
        return;
      }
      setSession(data.data);
      const next = params.get('next');
      const dest = next?.startsWith('/') && next !== '/' && next !== '/login' && data.data.user.role === 'CUSTOMER' ? next : home;
      navigate(dest);
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setServerError(te(ax.response?.data?.message) || t('auth.loginFail'));
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] border border-navy-800/8 bg-white p-7 shadow-lift"
    >
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.welcome')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.loginTitle')}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('auth.loginSubtitle')}</p>

      <form className="mt-8 space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          id="email"
          label={t('auth.email')}
          type="email"
          placeholder="you@email.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <Input
          id="password"
          label={t('auth.password')}
          type="password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />
        <div className="flex items-center justify-between text-sm">
          <label className="inline-flex items-center gap-2 text-ink-600">
            <input type="checkbox" className="accent-navy-800" {...register('remember')} />
            {t('auth.remember')}
          </label>
          <Link to="/login" className="font-medium text-navy-700 hover:underline">
            {t('auth.forgot')}
          </Link>
        </div>
        {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
        <Button type="submit" className="w-full" loading={isSubmitting}>
          {t('auth.loginBtn')}
        </Button>
      </form>

      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-ink-400">
        <span className="h-px flex-1 bg-navy-800/10" />
        {t('common.or')}
        <span className="h-px flex-1 bg-navy-800/10" />
      </div>
      <div className="space-y-2">
        <Button type="button" variant="social" disabled>
          {t('auth.google')}
        </Button>
        <Button type="button" variant="social" disabled>
          {t('auth.facebook')}
        </Button>
      </div>
      <p className="mt-6 text-center text-sm text-ink-400">
        {t('auth.newHere')}{' '}
        <Link to="/register" className="font-semibold text-navy-800">
          {t('auth.createAccount')}
        </Link>
      </p>
    </motion.div>
  );
}
