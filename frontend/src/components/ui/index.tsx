import { useMotionPreference } from '../../lib/motion';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, X } from 'lucide-react';
import { durations, easeOutExpo, spring } from '../../design/motion';

export function Button({ variant = 'primary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  return <button className={`button button-${variant} ${className}`} {...props} />;
}
export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props} />;
}
export function Chip({ children, tone = 'cyan' }: { children: ReactNode; tone?: 'cyan' | 'mint' | 'amber' | 'coral' | 'violet' }) {
  return <span className={`chip tone-${tone}`}>{children}</span>;
}
export function Badge({ children, tone = 'mint' }: { children: ReactNode; tone?: 'mint' | 'amber' | 'coral' }) {
  return <span className={`badge tone-${tone}`}><span className="status-dot" />{children}</span>;
}
export function Kbd({ children }: { children: ReactNode }) { return <kbd>{children}</kbd>; }
export function Tooltip({ label, children, shortcut }: { label: string; children: ReactNode; shortcut?: string }) {
  const id = useId();
  return <span className="tooltip-wrap" tabIndex={0} aria-describedby={id}>{children}<span role="tooltip" id={id} className="tooltip">{label} {shortcut && <Kbd>{shortcut}</Kbd>}</span></span>;
}
export function Tabs({ items, onChange }: { items: { id: string; label: string; content: ReactNode }[]; onChange?: (id: string) => void }) {
  const [active, setActive] = useState(items[0].id);
  const prefix = useId();
  const root = useRef<HTMLDivElement>(null);
  function select(index: number) { const id = items[index].id; setActive(id); onChange?.(id); root.current?.querySelector<HTMLButtonElement>(`[data-tab="${id}"]`)?.focus(); }
  return <div ref={root}><div role="tablist" aria-label="Component states" className="tabs">{items.map((item, index) => <button key={item.id} role="tab" data-tab={item.id} id={`${prefix}-${item.id}`} aria-controls={`${prefix}-${item.id}-panel`} aria-selected={active === item.id} tabIndex={active === item.id ? 0 : -1} onClick={() => select(index)} onKeyDown={event => {
    const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null;
    if (next !== null) { event.preventDefault(); select(next); }
  }}>{active === item.id && <motion.span className="active-tab" layoutId={`${prefix}-tab`} transition={spring} /> }<span>{item.label}</span></button>)}</div>{items.map(item => <div key={item.id} id={`${prefix}-${item.id}-panel`} role="tabpanel" aria-labelledby={`${prefix}-${item.id}`} hidden={active !== item.id} className="tab-panel">{item.content}</div>)}</div>;
}
export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <button role="switch" aria-checked={checked} className="toggle-row" onClick={() => onChange(!checked)}><span>{label}</span><span className={`toggle ${checked ? 'on' : ''}`}><motion.span animate={{ x: checked ? 18 : 0 }} transition={spring} /></span></button>;
}
export function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return <div className="slider-wrap"><label htmlFor={id}>{label}<span className="mono">{value}%</span></label><input id={id} type="range" min="0" max="100" value={value} onChange={event => onChange(Number(event.target.value))} style={{ '--range': `${value}%` } as CSSProperties} /></div>;
}
export function CopyButton({ text, label, onCopied, onFailed }: { text: string; label: string; onCopied?: () => void; onFailed?: () => void }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => { if (!copied) return; const timer = window.setTimeout(() => setCopied(false), durations.toast * 1000); return () => clearTimeout(timer); }, [copied]);
  return <Button variant="ghost" onClick={async () => {
    try { await navigator.clipboard.writeText(text); setCopied(true); onCopied?.(); } catch { onFailed?.(); }
  }}>{copied ? <motion.span initial={{ scale: .6 }} animate={{ scale: 1 }} transition={spring} style={{ display: 'inline-flex' }}><Check size={13} /></motion.span> : <Copy size={13} />}{copied ? 'Copied' : label}</Button>;
}
export function Skeleton({ width = '100%', label = 'Loading preview' }: { width?: string; label?: string }) {
  return <div className="skeleton" role="status" aria-label={label} style={{ width }} />;
}
export function ProgressRing({ value, label }: { value: number; label: string }) {
  const reduced = useMotionPreference();
  const percent = Math.min(100, Math.max(0, value));
  return <div className="progress-ring" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={label}><svg viewBox="0 0 120 120" aria-hidden="true"><circle className="progress-ring-track" cx="60" cy="60" r="50" /><motion.circle className="progress-ring-value" cx="60" cy="60" r="50" pathLength="100" strokeDasharray="100" initial={{ strokeDashoffset: reduced ? 100 - percent : 100 }} animate={{ strokeDashoffset: 100 - percent }} transition={{ duration: reduced ? 0 : durations.count, ease: easeOutExpo }} /></svg><span className="mono">{percent}<small>%</small></span></div>;
}
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const reduced = useMotionPreference();
  const min = Math.min(...values), range = Math.max(...values) - min || 1;
  const points = values.map((n, i) => `${(i / Math.max(values.length - 1, 1)) * 160},${38 - ((n - min) / range) * 32}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 160 44" role="img" aria-label={label}><motion.polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : durations.count, ease: easeOutExpo }} /></svg>;
}
export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  const closeRef = useRef(onClose); closeRef.current = onClose;
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => closeRef.current(), durations.toast * 1000); return () => clearTimeout(timer); }, [message]);
  return <div className="toast-region" role="status" aria-live="polite"><AnimatePresence>{message && <motion.div key={message} className="toast card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}><Check size={18} /><span>{message}</span><button aria-label="Dismiss notification" onClick={onClose}><X size={16} /></button><motion.div className="toast-progress" initial={{ scaleX: 1 }} animate={{ scaleX: 0 }} transition={{ duration: durations.toast, ease: 'linear' }} /></motion.div>}</AnimatePresence></div>;
}
