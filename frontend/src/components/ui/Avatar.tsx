import * as RadixAvatar from '@radix-ui/react-avatar';
import { cn } from '@/lib/cn';

interface AvatarProps {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
};

export function Avatar({ name, src, size = 'md', className }: AvatarProps) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <RadixAvatar.Root
      className={cn(
        'inline-flex items-center justify-center overflow-hidden rounded-full bg-navy-800 text-paper-50',
        sizes[size],
        className
      )}
    >
      <RadixAvatar.Image src={src} alt={name} className="h-full w-full object-cover" />
      <RadixAvatar.Fallback className="font-display font-semibold">{initials}</RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
}
