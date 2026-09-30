import { Component, type ErrorInfo, type ReactNode } from 'react';

function readBoundaryLanguage() {
  try {
    const raw = localStorage.getItem('buildmate-language');
    if (!raw) return 'vi';
    const parsed = JSON.parse(raw) as { language?: string } | string;
    const lang = typeof parsed === 'string' ? parsed : parsed.language;
    return lang === 'en' ? 'en' : 'vi';
  } catch {
    return 'vi';
  }
}

/**
 * Bắt lỗi render. Không dùng i18n ở đây — nếu i18n lỗi thì boundary cũng trắng trang.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[BuildMate] render error', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const english = readBoundaryLanguage() === 'en';
    const copy = english
      ? {
          title: 'This page failed to load',
          body: 'Reload and try again. Your sign-in data stays on the server.',
          login: 'Back to login',
        }
      : {
          title: 'Có lỗi khi tải trang',
          body: 'Thử tải lại. Dữ liệu đăng nhập không bị mất trên server.',
          login: 'Về đăng nhập',
        };

    return (
      <div className="grid min-h-screen place-items-center bg-paper-100 px-4">
        <div className="w-full max-w-md rounded-[22px] border border-navy-800/8 bg-white p-8 text-center shadow-card">
          <p className="text-xs uppercase tracking-[0.28em] text-copper-500">BuildMate</p>
          <h1 className="mt-3 font-display text-3xl text-navy-800">{copy.title}</h1>
          <p className="mt-3 text-sm text-ink-400">{copy.body}</p>
          <button
            type="button"
            className="mt-6 inline-flex h-11 items-center justify-center rounded-full bg-navy-800 px-6 text-sm font-semibold text-paper-50 hover:bg-navy-700"
            onClick={() => {
              this.setState({ error: null });
              window.location.assign('/login');
            }}
          >
            {copy.login}
          </button>
        </div>
      </div>
    );
  }
}
