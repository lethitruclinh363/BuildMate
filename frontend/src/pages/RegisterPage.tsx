import { zodResolver } from '@hookform/resolvers/zod';
import { AxiosError } from 'axios';
import { motion } from 'framer-motion';
import { Briefcase, Home } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/cn';
import { api } from '@/lib/api';
import { useI18n } from '@/locales';
import { homeForRole, useAuthStore } from '@/store/auth.store';
import type { ApiResponse, AuthPayload, UserRole } from '@/types/user';

type FormValues = { name: string; email: string; phone?: string; password: string };

export function RegisterPage() {
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);
  const [role, setRole] = useState<Extract<UserRole, 'CUSTOMER' | 'CONTRACTOR'> | null>(null);
  const [serverError, setServerError] = useState('');
  const { t, te } = useI18n();

  const roles = [
    { id: 'CUSTOMER' as const, title: t('auth.roleCustomerTitle'), description: t('auth.roleCustomerBody'), icon: Home },
    { id: 'CONTRACTOR' as const, title: t('auth.roleContractorTitle'), description: t('auth.roleContractorBody'), icon: Briefcase },
  ];

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t('auth.nameRequired')),
        email: z.string().email(t('auth.invalidEmail')),
        phone: z.string().optional(),
        password: z.string().min(8, t('auth.passwordMin')),
      }),
    [t]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: FormValues) => {
    if (!role) return;
    setServerError('');
    try {
      const { data } = await api.post<ApiResponse<AuthPayload>>('/auth/register', {
        ...values,
        role,
      });
      const home = homeForRole(data.data.user.role);
      if (home === '/login') {
        setServerError(t('auth.registerFail'));
        return;
      }
      setSession(data.data);
      navigate(home);
    } catch (err) {
      const ax = err as AxiosError<ApiResponse<null>>;
      setServerError(te(ax.response?.data?.message) || t('auth.registerFail'));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} className="w-full">
      <p className="text-xs uppercase tracking-[0.24em] text-copper-500">{t('auth.join')}</p>
      <h1 className="mt-2 font-display text-3xl text-navy-800">{t('auth.registerTitle')}</h1>
      <p className="mt-2 text-sm text-ink-400">{t('auth.registerSubtitle')}</p>

      <div className="mt-6 grid gap-3">
        {roles.map((item) => (
          <Card
            key={item.id}
            hover
            onClick={() => setRole(item.id)}
            className={cn('cursor-pointer p-4', role === item.id && 'border-copper-400 ring-4 ring-copper-400/20')}
          >
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-navy-800 text-paper-50">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-lg text-navy-800">{item.title}</h2>
                <p className="text-sm text-ink-600">{item.description}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {role ? (
        <motion.form
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-4 rounded-[28px] border border-navy-800/8 bg-white p-6 shadow-card"
          onSubmit={handleSubmit(onSubmit)}
        >
          <Input id="name" label={t('auth.fullName')} error={errors.name?.message} {...register('name')} />
          <Input id="email" label={t('auth.email')} type="email" error={errors.email?.message} {...register('email')} />
          <Input id="phone" label={t('auth.phone')} error={errors.phone?.message} {...register('phone')} />
          <Input id="password" label={t('auth.password')} type="password" error={errors.password?.message} {...register('password')} />
          {serverError ? <p className="text-sm text-red-600">{serverError}</p> : null}
          <Button type="submit" className="w-full" loading={isSubmitting}>
            {t('auth.createRoleAccount', { role: t(`role.${role}`) })}
          </Button>
        </motion.form>
      ) : null}

      <p className="mt-6 text-center text-sm text-ink-400">
        {t('auth.already')}{' '}
        <Link to="/login" className="font-semibold text-navy-800">
          {t('common.login')}
        </Link>
      </p>
    </motion.div>
  );
}
