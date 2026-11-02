import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMotionPreference } from '../../lib/motion';

const SPEED_PX_PER_S = 14;
const WHEEL_REST_MS = 4000;
/** Matches the stacked layout in shell.css. Short windows stack too, because fixed panels there would clip their content. */
const STACKED_QUERY = '(max-width: 1024px), (max-height: 760px)';

export function useStacked() {
  const [stacked, setStacked] = useState(() => window.matchMedia(STACKED_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(STACKED_QUERY);
    const update = () => setStacked(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return stacked;
}

/** Tracks whether a region overflows, and how far it has scrolled, without a scroll-driven React render on every pixel. */
export function useScrollState(ref: RefObject<HTMLElement>) {
  const [state, setState] = useState({ scrollable: false, atStart: true, atEnd: true });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const scrollable = element.scrollHeight > element.clientHeight + 1;
      const atStart = element.scrollTop <= 1, atEnd = element.scrollTop + element.clientHeight >= element.scrollHeight - 1;
      setState(previous => previous.scrollable === scrollable && previous.atStart === atStart && previous.atEnd === atEnd ? previous : { scrollable, atStart, atEnd });
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => { element.removeEventListener('scroll', update); observer.disconnect(); };
  }, [ref]);
  return state;
}

export type AutoScrollState = 'off' | 'running' | 'paused';

/**
 * Slow idle scrolling for long lists. It stops while pointed at, focused, off screen or just scrolled by hand,
 * and never runs under reduced motion. It is one rAF loop per panel, and only while actually moving.
 */
export function useAutoScroll(ref: RefObject<HTMLElement>, enabled: boolean, userPaused: boolean): AutoScrollState {
  const reduced = useMotionPreference();
  const [state, setState] = useState<AutoScrollState>('off');
  useEffect(() => {
    const element = ref.current;
    if (!element || !enabled || reduced) { setState('off'); return; }
    let frame = 0, last = 0, position = element.scrollTop, hovering = false, focused = false, inView = true, restUntil = 0;
    const blocked = () => userPaused || hovering || focused || !inView || document.hidden || performance.now() < restUntil;
    const step = (now: number) => {
      frame = 0;
      if (blocked()) { setState('paused'); return; }
      setState('running');
      const delta = last ? Math.min(now - last, 64) : 16;
      last = now;
      position += SPEED_PX_PER_S * delta / 1000;
      if (position >= element.scrollHeight - element.clientHeight - 1) { position = 0; restUntil = now + 1500; }
      element.scrollTop = position;
      frame = requestAnimationFrame(step);
    };
    const wake = () => { if (!frame && !blocked()) { last = 0; position = element.scrollTop; frame = requestAnimationFrame(step); } else if (blocked()) setState('paused'); };
    const enter = () => { hovering = true; wake(); }, leave = () => { hovering = false; wake(); };
    const focusIn = () => { focused = true; wake(); }, focusOut = () => { focused = false; wake(); };
    const rest = () => { restUntil = performance.now() + WHEEL_REST_MS; wake(); window.setTimeout(wake, WHEEL_REST_MS + 20); };
    element.addEventListener('pointerenter', enter);
    element.addEventListener('pointerleave', leave);
    element.addEventListener('focusin', focusIn);
    element.addEventListener('focusout', focusOut);
    element.addEventListener('wheel', rest, { passive: true });
    element.addEventListener('touchstart', rest, { passive: true });
    document.addEventListener('visibilitychange', wake);
    const observer = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; wake(); });
    observer.observe(element);
    wake();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', wake);
      element.removeEventListener('pointerenter', enter);
      element.removeEventListener('pointerleave', leave);
      element.removeEventListener('focusin', focusIn);
      element.removeEventListener('focusout', focusOut);
      element.removeEventListener('wheel', rest);
      element.removeEventListener('touchstart', rest);
    };
  }, [ref, enabled, reduced, userPaused]);
  return state;
}

/**
 * One independently scrolling dashboard region. Scrolling never chains into the page while it can scroll itself.
 * When panels stack on small screens they stop scrolling internally, so there is only one scroll surface to reason about.
 */
export function ScrollPanel({ title, eyebrow, actions, autoScroll = false, children, className = '', testId }: { title: string; eyebrow?: string; actions?: ReactNode; autoScroll?: boolean; children: ReactNode; className?: string; testId?: string }) {
  const body = useRef<HTMLDivElement>(null);
  const stacked = useStacked();
  const [userPaused, setUserPaused] = useState(false);
  const scroll = useScrollState(body);
  const auto = useAutoScroll(body, autoScroll && !stacked && scroll.scrollable, userPaused);
  const toggle = useCallback(() => setUserPaused(value => !value), []);
  return <section className={`scroll-panel ${className}`} aria-label={title} data-testid={testId} data-autoscroll={auto}>
    <i className="panel-tick tl" aria-hidden="true" /><i className="panel-tick br" aria-hidden="true" />
    <header className="scroll-panel-head">
      <div>{eyebrow && <span className="panel-eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>
      <div className="scroll-panel-actions">
        {actions}
        {auto !== 'off' && <button type="button" className="icon-button small" aria-pressed={userPaused} aria-label={userPaused ? 'Resume auto-scroll' : 'Pause auto-scroll'} onClick={toggle}>{userPaused ? <Play size={12} /> : <Pause size={12} />}</button>}
      </div>
    </header>
    <div ref={body} className={`scroll-panel-body ${scroll.atStart ? '' : 'fade-top'} ${scroll.atEnd ? '' : 'fade-bottom'}`} tabIndex={scroll.scrollable ? 0 : undefined} role={scroll.scrollable ? 'region' : undefined} aria-label={scroll.scrollable ? `${title}, scrollable` : undefined} data-scroll-region="">
      <div className="scroll-panel-content">{children}</div>
    </div>
  </section>;
}
