import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'icon';
  children: ReactNode;
};

export function Button({ className, variant = 'default', size = 'default', children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-[#8b96a6]/40 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4',
        variant === 'default' && 'bg-[#e8e2d6] text-[#101216] hover:bg-white',
        variant === 'outline' && 'border border-[#232833] bg-transparent hover:bg-[#191d24]',
        variant === 'ghost' && 'bg-transparent hover:bg-[#191d24]',
        size === 'icon' ? 'size-8' : 'h-8 px-2.5',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
