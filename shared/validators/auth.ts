export interface LoginFields {
  email: string;
  password: string;
}

export function validateLogin(input: LoginFields): string | null {
  if (!input.email || !input.email.includes('@')) return 'Invalid email';
  if (!input.password || input.password.length < 8) return 'Password must be at least 8 characters';
  return null;
}

export const PROGRESS_STATUSES = ['STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
