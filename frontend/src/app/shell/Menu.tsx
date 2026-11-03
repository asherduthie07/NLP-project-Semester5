import { useCallback, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { durations, easeOutExpo } from '../../design/motion';

const ITEMS = '[role^="menuitem"]:not([aria-disabled="true"])';

/** A button with a popup. "menu" supports arrow keys; "dialog" is a non-modal panel for content such as notifications. */
export function Popover({ label, trigger, triggerClass = '', kind = 'menu', align = 'start', testId, children }: { label: string; trigger: ReactNode; triggerClass?: string; kind?: 'menu' | 'dialog'; align?: 'start' | 'end'; testId?: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback((restore = true) => { setOpen(false); if (restore) button.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(false); };
    document.addEventListener('pointerdown', outside);
    const target = kind === 'menu' ? popup.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? popup.current?.querySelector<HTMLElement>(ITEMS) : popup.current;
    target?.focus();
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, close, kind]);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') { if (kind === 'menu') close(false); return; }
    if (kind !== 'menu') return;
    const items = [...(popup.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null && items.length) { event.preventDefault(); items[next].focus(); }
  }
  return <div ref={root} className="popover-root" onKeyDown={onKeyDown} data-testid={testId}>
    <button ref={button} type="button" className={triggerClass} aria-label={label} aria-haspopup={kind} aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(value => !value)}>{trigger}</button>
    <AnimatePresence>
      {open && <motion.div ref={popup} id={id} className={`popover popover-${align}`} role={kind} aria-label={label} tabIndex={-1} initial={{ opacity: 0, y: -6, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: durations.feedback * 1.4, ease: easeOutExpo }}>
        {children(close)}
      </motion.div>}
    </AnimatePresence>
  </div>;
}

export function MenuItem({ children, checked, onSelect, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onSelect'> & { checked?: boolean; onSelect: () => void }) {
  const radio = checked !== undefined;
  return <button type="button" className="menu-item" role={radio ? 'menuitemradio' : 'menuitem'} aria-checked={radio ? checked : undefined} tabIndex={-1} onClick={onSelect} {...props}>
    <span className="menu-item-body">{children}</span>
    {checked && <Check size={13} className="cyan" aria-hidden="true" />}
  </button>;
}

export function MenuNote({ children }: { children: ReactNode }) { return <p className="menu-note">{children}</p>; }
