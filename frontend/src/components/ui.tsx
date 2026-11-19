import {
  createContext, useCallback, useContext, useEffect, useId, useRef, useState,
  type ReactNode,
} from 'react';
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, RotateCw, X } from 'lucide-react';
import { fmt } from '../lib/format';
import { t } from '../i18n';

// ---------------------------------------------------------------- overlays

/** Open overlays, newest last: only the top one reacts to Esc / Tab. */
const overlayStack: symbol[] = [];

function useOverlayBehaviour(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const me = Symbol('overlay');
    overlayStack.push(me);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusable = () =>
      Array.from(el?.querySelectorAll<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ) ?? []);
    // Focus the first form control, else the first button.
    (focusable().find((n) => n.matches('input, select, textarea')) ?? focusable()[0])?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (overlayStack[overlayStack.length - 1] !== me) return;
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = focusable();
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      overlayStack.splice(overlayStack.indexOf(me), 1);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}

interface OverlayProps {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  size?: 'sm' | 'md';
  as?: 'form';
  onSubmit?: (e: React.FormEvent) => void;
}

function OverlayFrame({ kind, title, onClose, children, footer, headerExtra, size, as, onSubmit }: OverlayProps & { kind: 'modal' | 'drawer' }) {
  const ref = useOverlayBehaviour(onClose);
  const titleId = useId();
  const Body = as === 'form' ? 'form' : 'div';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        className={`${kind} ${size === 'sm' ? 'sm' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <Body
          style={{ display: 'contents' }}
          {...(as === 'form' ? { onSubmit: (e: React.FormEvent) => { e.preventDefault(); onSubmit?.(e); }, noValidate: true } : {})}
        >
          <div className="overlay-head">
            <h2 id={titleId}>{title}</h2>
            {headerExtra}
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label={t('common.close')}>
              <X size={18} />
            </button>
          </div>
          <div className="overlay-body">{children}</div>
          {footer && <div className="overlay-foot">{footer}</div>}
        </Body>
      </div>
    </div>
  );
}

export const Modal = (p: OverlayProps) => <OverlayFrame kind="modal" {...p} />;
export const Drawer = (p: OverlayProps) => <OverlayFrame kind="drawer" {...p} />;

// ---------------------------------------------------------------- fields

export function Field({ label, hint, error, children }: {
  label: string; hint?: ReactNode; error?: string; children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {error ? <span className="err" role="alert">{error}</span> : hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={18} style={{ flex: 'none', marginTop: 2 }} />
      <span>{message}</span>
    </div>
  );
}

// ---------------------------------------------------------------- states

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state">
      <Inbox size={30} strokeWidth={1.6} />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : t('common.loadFailed');
  return (
    <div className="state" role="alert">
      <AlertCircle size={30} strokeWidth={1.6} color="var(--out)" />
      <h3>{t('common.loadFailed')}</h3>
      <p>{msg}</p>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}><RotateCw size={14} /> {t('common.retry')}</button>
      )}
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <tbody aria-busy="true">
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }, (_, c) => (
            <td key={c}><div className="skeleton" style={{ height: 14, width: `${50 + ((r + c) % 4) * 12}%` }} /></td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number; pageSize: number; total: number; onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pager">
      <span>{t('common.rangeOf', { from: fmt.int(from), to: fmt.int(to), total: fmt.int(total) })}</span>
      <span className="spacer" />
      <button className="btn btn-sm btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('common.prevPage')}>
        <ChevronRight size={16} className="flip" />
      </button>
      <span>{t('common.pageOf', { page, pages })}</span>
      <button className="btn btn-sm btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('common.nextPage')}>
        <ChevronLeft size={16} className="flip" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- toasts

type Toast = { id: number; text: string; kind: 'ok' | 'error' };
const ToastCtx = createContext<(text: string, kind?: Toast['kind']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
            {t.kind === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------------------------------------------------------------- confirm

export function ConfirmDialog({ title, text, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; text: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      size="sm"
      title={title}
      onClose={onClose}
      footer={
        <>
          <span className="spacer" />
          <button className="btn" onClick={onClose}>{t('common.back')}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-dark'}`} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
