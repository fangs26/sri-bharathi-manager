import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { IconAlert, IconCheck, IconClose } from './icons';
import type { BillStatus } from '@/data/types';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* -------------------------------------------------------------- button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type ButtonSize = 'sm' | 'md' | 'lg';

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition ' +
  'active:translate-y-px disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap';

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-terracotta text-white shadow-[0_1px_2px_rgba(59,45,36,.18)] hover:bg-terracotta-dk',
  secondary: 'bg-white text-ink border border-line hover:border-[#d9c9ae] hover:bg-cream-2/60',
  ghost: 'text-brown hover:bg-cream-2',
  danger: 'bg-white text-[#a3372a] border border-[#e8c9c1] hover:bg-[#fdf1ee]',
  quiet: 'text-muted hover:text-ink hover:bg-cream-2',
};

// Taller on a phone, where a thumb needs roughly 40px to hit reliably; the
// original compact sizes come back on a desktop where there is a pointer.
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'h-10 px-3.5 text-[13px] md:h-8 md:px-3',
  md: 'h-11 px-4 text-[13.5px] md:h-9.5',
  lg: 'h-12 px-5 text-[15px] md:h-11',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className)} {...rest} />;
}

export function IconButton({
  label,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      title={label}
      aria-label={label}
      className={cx(
        'inline-flex h-9.5 w-9.5 items-center justify-center rounded-lg text-muted transition md:h-8 md:w-8',
        'hover:bg-cream-2 hover:text-ink',
        className
      )}
      {...rest}
    />
  );
}

/* --------------------------------------------------------------- cards */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('card', className)}>{children}</div>;
}

export function SectionTitle({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-[var(--font-display)] text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {hint && <p className="mt-0.5 text-[12.5px] text-muted">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const toneCls = {
    neutral: 'text-ink',
    good: 'text-sage-dk',
    warn: 'text-[#b07d16]',
    bad: 'text-terracotta-dk',
  }[tone];
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'card px-4 py-3.5 text-left transition',
        onClick && 'hover:shadow-[var(--shadow-lift)] hover:-translate-y-px'
      )}
    >
      <div className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-muted">
        {icon}
        {label}
      </div>
      <div className={cx('tnum mt-1.5 font-[var(--font-display)] text-[26px] leading-none font-semibold tracking-[-0.02em]', toneCls)}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12.5px] text-muted">{sub}</div>}
    </Tag>
  );
}

/* -------------------------------------------------------------- status */

export const STATUS_LABEL: Record<BillStatus | 'vacant', string> = {
  paid: 'Paid',
  partial: 'Part paid',
  due: 'Due',
  overdue: 'Overdue',
  waived: 'Waived',
  vacant: 'Vacant',
};

export const STATUS_STYLE: Record<BillStatus | 'vacant', string> = {
  paid: 'bg-sage-soft text-sage-dk border-[#cfdcc2]',
  partial: 'bg-gold-soft text-[#8a6410] border-[#eddcb2]',
  due: 'bg-cream-2 text-brown border-line',
  overdue: 'bg-terracotta-soft text-terracotta-dk border-[#e9cbbf]',
  waived: 'bg-cream-2 text-muted border-line',
  vacant: 'bg-transparent text-muted border-dashed border-[#d8c8ae]',
};

export function StatusChip({
  status,
  className,
  children,
}: {
  status: BillStatus | 'vacant';
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold',
        STATUS_STYLE[status],
        className
      )}
    >
      {children ?? STATUS_LABEL[status]}
    </span>
  );
}

/* -------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx('block', className)}>
      {label && <span className="label">{label}</span>}
      {children}
      {error ? (
        <span className="mt-1 block text-[12px] text-terracotta-dk">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[12px] text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx('field', props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx('field resize-y', props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx('field appearance-none bg-[right_10px_center] bg-no-repeat pr-8', props.className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%237C6B5C' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

export function MoneyInput({
  value,
  onValue,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  value: number | '';
  onValue: (n: number) => void;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
      <input
        {...rest}
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        onChange={(e) => onValue(e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)))}
        className="field tnum pl-7"
      />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode; count?: number }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex rounded-[10px] border border-line bg-white p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'whitespace-nowrap rounded-lg px-3 py-2.5 text-[13px] font-semibold transition md:py-1.5',
            value === o.value ? 'bg-ink text-cream shadow-sm' : 'text-muted hover:text-ink'
          )}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cx('tnum ml-1.5', value === o.value ? 'text-cream/60' : 'text-muted/70')}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- modals */

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'sm' | 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[width];

  return (
    // On a phone the dialog fills the screen from the bottom; on a desktop it
    // stays a centred card.
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="anim-fade absolute inset-0 bg-[#241b15]/35 backdrop-blur-[2px]" onClick={onClose} />
      <div
        className={cx(
          'anim-rise relative flex max-h-[92vh] w-full flex-col rounded-t-[18px] bg-white shadow-[var(--shadow-lift)]',
          'md:max-h-[88vh] md:rounded-[18px]',
          w
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-4 py-3.5 md:px-5 md:py-4">
          <div>
            <h3 className="font-[var(--font-display)] text-[16px] font-semibold tracking-[-0.01em]">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="h-9 w-9 shrink-0">
            <IconClose size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
        {footer && (
          <div
            className="flex justify-end gap-2 border-t border-line px-4 py-3 md:px-5 md:py-3.5"
            style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function SideSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="anim-fade absolute inset-0 bg-[#241b15]/30" onClick={onClose} />
      <aside className="anim-slide relative flex h-full w-full flex-col bg-cream shadow-[var(--shadow-lift)] md:max-w-[540px]">
        <header className="flex items-start justify-between gap-3 border-b border-line bg-white px-4 py-3.5 md:px-5 md:py-4">
          <div className="min-w-0">
            <div className="truncate font-[var(--font-display)] text-[16px] font-semibold tracking-[-0.015em] md:text-[17px]">
              {title}
            </div>
            {subtitle && <div className="mt-0.5 text-[12.5px] text-muted">{subtitle}</div>}
          </div>
          <IconButton label="Close" onClick={onClose} className="h-9 w-9 shrink-0">
            <IconClose size={19} />
          </IconButton>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">{children}</div>
        {footer && (
          <footer
            className="border-t border-line bg-white px-4 py-3 md:px-5 md:py-3.5"
            style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom))' }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-brown">{message}</p>
    </Modal>
  );
}

/* --------------------------------------------------------------- misc */

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[16px] border border-dashed border-[#dfd0b8] bg-white/50 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-[#c9b89c]">{icon}</div>}
      <h3 className="font-[var(--font-display)] text-[15px] font-semibold">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
  // Stable hue per name so the same girl always looks the same.
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  const palette = ['#EADBC4', '#E6ECDF', '#F4E2D9', '#F9EDD2', '#E9E3DA'][hue];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-brown"
      style={{ width: size, height: size, background: palette, fontSize: size * 0.36 }}
    >
      {letters || '?'}
    </span>
  );
}

export function ProgressBar({ value, max, tone = 'terracotta' }: { value: number; max: number; tone?: 'terracotta' | 'sage' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream-2">
      <div
        className={cx('h-full rounded-full transition-[width] duration-500', tone === 'sage' ? 'bg-sage' : 'bg-terracotta')}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* -------------------------------------------------------------- toasts */

interface Toast {
  id: number;
  message: string;
  tone: 'good' | 'bad' | 'info';
}
const ToastCtx = createContext<(message: string, tone?: Toast['tone']) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast['tone'] = 'good') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3600);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cx(
              'anim-rise pointer-events-auto flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium shadow-[var(--shadow-lift)]',
              t.tone === 'bad' ? 'bg-[#7d2f22] text-white' : t.tone === 'info' ? 'bg-brown text-cream' : 'bg-sage-dk text-white'
            )}
          >
            {t.tone === 'bad' ? <IconAlert size={15} /> : <IconCheck size={15} />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
