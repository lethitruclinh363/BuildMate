import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface DropdownItem {
  label: string;
  onSelect?: () => void;
  danger?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
}

export function Dropdown({ trigger, items }: DropdownProps) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-44 rounded-2xl border border-navy-800/8 bg-white p-1.5 shadow-lift"
        >
          {items.map((item) => (
            <Menu.Item
              key={item.label}
              onSelect={item.onSelect}
              className={cn(
                'cursor-pointer rounded-xl px-3 py-2 text-sm outline-none',
                item.danger
                  ? 'text-red-600 hover:bg-red-50'
                  : 'text-ink-800 hover:bg-paper-100'
              )}
            >
              {item.label}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
