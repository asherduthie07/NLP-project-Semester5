import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Hexagon, Pin, PinOff, X } from 'lucide-react';
import { Kbd } from '../../components/ui';
import { spring } from '../../design/motion';
import { destinations, type Destination } from '../nav';
import { useShellStore } from '../store';

/** The tooltip answers a quick pass over an icon. Expanding waits, so it only happens on a real pause. */
const OPEN_DELAY = 450, CLOSE_DELAY = 220;

function RailLink({ item, showHints, layoutGroup, onTooltip, onNavigate }: { item: Destination; showHints: boolean; layoutGroup: string; onTooltip: (tip: { item: Destination; top: number } | null) => void; onNavigate?: () => void }) {
  const Icon = item.icon;
  const show = (element: HTMLElement) => { const rect = element.getBoundingClientRect(); onTooltip({ item, top: rect.top + rect.height / 2 }); };
  return <li>
    <NavLink to={item.path} className="rail-link" onClick={onNavigate} onPointerEnter={event => show(event.currentTarget)} onPointerLeave={() => onTooltip(null)} onFocus={event => show(event.currentTarget)} onBlur={() => onTooltip(null)}>
      {({ isActive }) => <>
        {isActive && <motion.span className="rail-plate" layoutId={`rail-plate-${layoutGroup}`} transition={spring} aria-hidden="true" />}
        <span className="rail-icon"><Icon size={18} aria-hidden="true" /></span>
        <span className="rail-label">{item.label}</span>
        {showHints && <span className="rail-keys" aria-hidden="true"><Kbd>G</Kbd><Kbd>{item.key.toUpperCase()}</Kbd></span>}
      </>}
    </NavLink>
  </li>;
}

/** Hover or keyboard focus expands over the page, and pinning makes room for it, so hovering never moves content. */
export function Rail({ variant = 'rail' }: { variant?: 'rail' | 'drawer' }) {
  const pinned = useShellStore(state => state.pinned);
  const setPinned = useShellStore(state => state.setPinned);
  const singleKey = useShellStore(state => state.singleKeyShortcuts);
  const setDrawerOpen = useShellStore(state => state.setDrawerOpen);
  const [peek, setPeek] = useState(false);
  const [tip, setTip] = useState<{ item: Destination; top: number } | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const drawer = variant === 'drawer';
  const expanded = drawer || pinned || peek;
  const schedule = (next: boolean, delay: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => { setPeek(next); if (next) setTip(null); }, delay); };
  const onFocus = (event: FocusEvent<HTMLElement>) => { if (!drawer && event.target.matches(':focus-visible')) schedule(true, 0); };
  const onBlur = (event: FocusEvent<HTMLElement>) => { if (!drawer && !event.currentTarget.contains(event.relatedTarget)) schedule(false, CLOSE_DELAY); };
  const close = drawer ? () => setDrawerOpen(false) : undefined;
  const link = (item: Destination) => <RailLink key={item.id} item={item} showHints={expanded && singleKey} layoutGroup={variant} onTooltip={expanded ? () => undefined : setTip} onNavigate={close} />;
  return <nav className={`rail ${expanded ? 'expanded' : ''} ${drawer ? 'rail-drawer' : ''}`} aria-label="Primary" data-testid={drawer ? 'nav-drawer' : 'rail'} data-expanded={expanded} data-pinned={pinned}
    onPointerEnter={event => { if (event.pointerType === 'mouse') schedule(true, OPEN_DELAY); }} onPointerLeave={event => { if (event.pointerType === 'mouse') schedule(false, CLOSE_DELAY); }} onFocus={onFocus} onBlur={onBlur}>
    <div className="rail-brand">
      <span className="rail-logo"><Hexagon size={20} aria-hidden="true" /></span>
      <span className="rail-label rail-wordmark">CodeAtlas <b>AI</b></span>
      {drawer && <button type="button" className="icon-button rail-close" aria-label="Close navigation" onClick={close}><X size={16} /></button>}
    </div>
    <ul className="rail-list">{destinations.filter(item => item.group === 'main').map(link)}</ul>
    <ul className="rail-list rail-utility">
      {destinations.filter(item => item.group === 'utility').map(link)}
      {!drawer && <li><button type="button" className="rail-link rail-pin" aria-pressed={pinned} aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'} onClick={() => { setPinned(!pinned); setTip(null); }}>
        <span className="rail-icon">{pinned ? <PinOff size={17} aria-hidden="true" /> : <Pin size={17} aria-hidden="true" />}</span>
        <span className="rail-label">{pinned ? 'Unpin sidebar' : 'Pin sidebar'}</span>
        {singleKey && <span className="rail-keys" aria-hidden="true"><Kbd>[</Kbd></span>}
      </button></li>}
    </ul>
    {tip && !expanded && <div className="rail-tooltip" role="presentation" style={{ top: tip.top }}>{tip.item.label}{singleKey && <span className="rail-tooltip-keys"><Kbd>G</Kbd><Kbd>{tip.item.key.toUpperCase()}</Kbd></span>}</div>}
  </nav>;
}
