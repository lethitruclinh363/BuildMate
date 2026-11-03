import { useEffect, useRef, useState } from 'react';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  accounts: {
    id: {
      initialize: (options: {
        client_id: string;
        nonce: string;
        callback: (response: GoogleCredentialResponse) => void;
        auto_select: boolean;
      }) => void;
      renderButton: (
        element: HTMLElement,
        options: {
          theme: 'outline';
          size: 'large';
          text: 'continue_with';
          shape: 'pill';
          width: number;
        }
      ) => void;
    };
  };
};

declare global {
  interface Window {
    google?: GoogleIdentityApi;
  }
}

type Props = {
  disabled?: boolean;
  label: string;
  unavailableMessage: string;
  loadErrorMessage: string;
  onCredential: (credential: string, nonce: string) => void;
};

const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';

export function GoogleSignInButton({
  disabled = false,
  label,
  unavailableMessage,
  loadErrorMessage,
  onCredential,
}: Props) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loadError, setLoadError] = useState(false);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || !buttonRef.current) return;

    let active = true;
    const renderGoogleButton = () => {
      if (!active || !buttonRef.current || !window.google) return;
      const nonce = crypto.randomUUID();
      window.google.accounts.id.initialize({
        client_id: clientId,
        nonce,
        auto_select: false,
        callback: (response) => {
          if (response.credential) onCredential(response.credential, nonce);
        },
      });
      buttonRef.current.replaceChildren();
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: Math.floor(buttonRef.current.clientWidth),
      });
    };
    const markLoadFailure = () => {
      if (active) setLoadError(true);
    };

    let script = document.querySelector<HTMLScriptElement>('script[data-google-identity]');
    if (!script) {
      script = document.createElement('script');
      script.src = GOOGLE_SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = 'true';
      document.head.appendChild(script);
    }

    if (window.google) {
      renderGoogleButton();
    } else if (script.dataset.loaded === 'true') {
      markLoadFailure();
    } else {
      const onLoad = () => {
        script?.setAttribute('data-loaded', 'true');
        renderGoogleButton();
      };
      script.addEventListener('load', onLoad);
      script.addEventListener('error', markLoadFailure);
      return () => {
        active = false;
        script?.removeEventListener('load', onLoad);
        script?.removeEventListener('error', markLoadFailure);
      };
    }

    return () => {
      active = false;
    };
  }, [clientId, onCredential]);

  if (!clientId) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="h-11 w-full rounded-full border border-navy-800/15 bg-white text-sm font-semibold text-navy-800 opacity-60"
        >
          {label}
        </button>
        <p className="mt-2 text-center text-xs text-ink-400">{unavailableMessage}</p>
      </div>
    );
  }

  if (loadError) {
    return <p className="text-center text-sm text-red-700">{loadErrorMessage}</p>;
  }

  return (
    <div
      ref={buttonRef}
      className={disabled ? 'pointer-events-none opacity-60' : ''}
      aria-disabled={disabled}
    />
  );
}
