import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { ToastViewport } from '@/components/feedback/Toast';
import { AuthProvider } from '@/providers/AuthProvider';
import { SocketProvider } from '@/providers/SocketProvider';
import { I18nProvider } from '@/providers/I18nProvider';
import '@/locales/i18n';
import '@/styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <SocketProvider>
              <App />
              <ToastViewport />
            </SocketProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>
);
