import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/locales';
import { materialCartCount, useMaterialCartStore } from './material-cart.store';

export function CartLink({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { t } = useI18n();
  const { currentUser, token } = useAuth();
  const cartCount = useMaterialCartStore((state) => materialCartCount(state.items));
  const showCartBadge = Boolean(token && currentUser?.role === 'CUSTOMER' && cartCount > 0);

  return (
    <Link
      to="/cart"
      aria-label={t('cart.open', { n: showCartBadge ? cartCount : 0 })}
      className={cn(
        'relative grid h-10 w-10 place-items-center rounded-full',
        tone === 'dark' ? 'text-white hover:bg-white/10' : 'text-navy-800 hover:bg-paper-100'
      )}
    >
      <ShoppingCart className="h-5 w-5" />
      {showCartBadge ? (
        <span className="cart-badge absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-copper-400 px-1 text-[10px] font-bold leading-5 text-navy-900">
          {cartCount > 99 ? '99+' : cartCount}
        </span>
      ) : null}
    </Link>
  );
}
