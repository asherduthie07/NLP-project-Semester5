import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '../../../viz/store';
import { highlight, splitLines, type CodeLines } from './highlight';
import './code.css';

export type LineMark = 'support' | 'contradict' | 'focus' | 'docstring';
export interface GutterBadge { tone: 'mint' | 'coral' | 'amber' | 'cyan'; label: string; short: string }
export interface Flash { line: number; endLine: number; nonce: number }
export interface CodeViewHandle { lineElement: (line: number) => HTMLElement | null; container: () => HTMLElement | null }

/** Plain lines at once, then highlighted tokens when Shiki has loaded, so the code never blanks while it colors. */
export function useHighlighted(code: string | null, path: string, language: string | null): CodeLines | null {
  const [result, setResult] = useState<{ code: string; lines: CodeLines } | null>(null);
  useEffect(() => {
    if (code === null) return;
    let live = true;
    void highlight(splitLines(code).join('\n'), path, language).then(lines => { if (live) setResult({ code, lines }); });
    return () => { live = false; };
  }, [code, path, language]);
  /** Stable between renders, so effects that depend on the lines do not re-run until the text or tokens change. */
  const plain = useMemo(() => code === null ? null : splitLines(code).map(line => [{ content: line, color: null }]), [code]);
  if (code === null) return null;
  if (result?.code === code) return result.lines;
  return plain;
}

const Line = memo(function Line({ number, tokens, mark, badge, flashing, children }: { number: number; tokens: CodeLines[number]; mark?: LineMark; badge?: GutterBadge; flashing: boolean; children?: ReactNode }) {
  return <div className={`code-line${mark ? ` ${mark}` : ''}${flashing ? ' flash' : ''}`} data-line={number}>
    <span className="code-gutter">{badge && <span className={`code-badge ${badge.tone}`} title={badge.label}><span aria-hidden="true">{badge.short}</span><span className="sr-only">{badge.label}</span></span>}</span>
    <span className="code-num" aria-hidden="true">{number}</span>
    <code>{tokens.length ? tokens.map((token, index) => <span key={index} style={token.color ? { color: token.color } : undefined}>{token.content}</span>) : ' '}</code>
    {children}
  </div>;
});

interface CodeViewProps {
  lines: CodeLines;
  label: string;
  marks?: ReadonlyMap<number, LineMark>;
  badges?: ReadonlyMap<number, GutterBadge>;
  flash?: Flash | null;
  /** First line number shown, for excerpts. */
  start?: number;
  onPointerLine?: (line: number | null, element: HTMLElement | null) => void;
  onScroll?: () => void;
  className?: string;
  testId?: string;
}

/**
 * Read-only code listing. Each line carries `data-line`, so panels around it can locate lines for connectors and
 * hover cards without the listing knowing about them.
 */
export const CodeView = forwardRef<CodeViewHandle, CodeViewProps>(function CodeView({ lines, label, marks, badges, flash, start = 1, onPointerLine, onScroll, className = '', testId }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const [flashing, setFlashing] = useState<Flash | null>(null);
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  useEffect(() => { reducedRef.current = reduced; }, [reduced]);
  useImperativeHandle(ref, () => ({
    lineElement: line => host.current?.querySelector<HTMLElement>(`[data-line="${line}"]`) ?? null,
    container: () => host.current,
  }), []);

  useEffect(() => {
    if (!flash || !host.current) return;
    const target = host.current.querySelector<HTMLElement>(`[data-line="${flash.line}"]`);
    if (target) {
      const box = host.current;
      const top = target.offsetTop - box.clientHeight / 3;
      box.scrollTo({ top: Math.max(0, top), behavior: reducedRef.current ? 'auto' : 'smooth' });
    }
    setFlashing(flash);
    const timer = window.setTimeout(() => setFlashing(current => current === flash ? null : current), 1600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  return <div ref={host} className={`code-view ${className}`} role="region" aria-label={label} tabIndex={0} data-testid={testId} onScroll={onScroll}
    onPointerMove={onPointerLine ? event => {
      const element = (event.target as HTMLElement).closest<HTMLElement>('[data-line]');
      onPointerLine(element ? Number(element.dataset.line) : null, element);
    } : undefined}
    onPointerLeave={onPointerLine ? () => onPointerLine(null, null) : undefined}>
    <div className="code-lines">
      {lines.map((tokens, index) => {
        const number = index + start;
        return <Line key={number} number={number} tokens={tokens} mark={marks?.get(number)} badge={badges?.get(number)} flashing={!!flashing && number >= flashing.line && number <= flashing.endLine} />;
      })}
    </div>
  </div>;
});
