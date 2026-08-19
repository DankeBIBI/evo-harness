import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * SidebarItem — 侧栏导航条目（用于左栏/类别导航）
 *
 * 3 个状态:
 *   - default: 透明背景 + 灰文字
 *   - active: 蓝色文字 + 浅蓝背景
 *   - disabled: 降低透明度
 *
 * 2 个变体:
 *   - nav:  仅图标 + 标题 + 右侧徽章
 *   - list: 状态点 + 标题 + 副标题 + 右侧操作
 */
interface SidebarItemProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  /** 状态点（红/绿/蓝） */
  status?: 'idle' | 'running' | 'success' | 'error';
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onAction?: () => void;
  actionIcon?: ReactNode;
  variant?: 'nav' | 'list';
  className?: string;
}

const statusColors = {
  idle: 'bg-muted-foreground/40',
  running: 'bg-blue-500 animate-pulse',
  success: 'bg-emerald-500',
  error: 'bg-red-500',
} as const;

export function SidebarItem({
  icon: Icon,
  title,
  subtitle,
  badge,
  status,
  active,
  disabled,
  onClick,
  onAction,
  actionIcon,
  variant = 'nav',
  className,
}: SidebarItemProps) {
  if (variant === 'list') {
    return (
      <div
        className={cn(
          'group flex items-start gap-2 rounded-md px-2 py-2 transition-colors duration-150',
          active && 'bg-accent/60',
          !active && 'hover:bg-accent/40',
          disabled && 'opacity-50',
          onClick && 'cursor-pointer',
          className,
        )}
        onClick={onClick}
      >
        {status && (
          <span
            aria-label={`status-${status}`}
            className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', statusColors[status])}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-xs font-medium">{title}</div>
          {subtitle && (
            <div className="text-muted-foreground mt-0.5 truncate text-[10px]">{subtitle}</div>
          )}
        </div>
        {actionIcon && onAction && (
          <button
            aria-label="操作"
            className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onAction();
            }}
            type="button"
          >
            {actionIcon}
          </button>
        )}
      </div>
    );
  }

  // nav variant
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors duration-150',
        active && 'bg-accent/60 text-foreground',
        !active && 'text-muted-foreground hover:bg-accent/30 hover:text-foreground',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {Icon && <Icon className={cn('h-[16px] w-[16px] shrink-0', active && 'text-primary')} />}
      <span className={cn('flex-1 truncate text-sm', active && 'font-medium')}>{title}</span>
      {badge !== undefined && badge !== null && (
        <span className="text-muted-foreground text-xs tabular-nums">{badge}</span>
      )}
    </button>
  );
}
