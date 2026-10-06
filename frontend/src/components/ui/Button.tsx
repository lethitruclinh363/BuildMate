import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium normal-case tracking-normal transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-copper-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:
          'bg-navy-800 text-paper-50 hover:bg-navy-700',
        copper:
          'bg-copper-400 text-navy-900 hover:bg-copper-300',
        outline:
          'border border-navy-800/15 bg-white/70 text-navy-800 hover:border-navy-800/40 hover:bg-white',
        ghost: 'text-navy-800 hover:bg-navy-800/8',
        social:
          'w-full rounded-lg border border-navy-800/10 bg-white text-ink-800 hover:border-navy-800/25',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);

    // Radix Slot 1.3+ throws unless it receives exactly one React element.
    // Never inject spinner/null siblings on the asChild path.
    if (asChild) {
      return (
        <Slot className={classes} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }

    return (
      <button
        className={classes}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
