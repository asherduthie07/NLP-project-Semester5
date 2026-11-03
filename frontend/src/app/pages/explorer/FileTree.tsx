import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, File, FileCode2, FileCog, FileText, Folder, FolderOpen, Search, X } from 'lucide-react';
import type { FileNode } from '../../../data/dashboard';
import { coverageTone, languageColor } from '../code/symbols';

interface Row { node: FileNode; depth: number; parent: string | null }

const iconFor = (node: FileNode) => {
  if (node.type === 'directory') return null;
  const extension = node.name.split('.').pop()!.toLowerCase();
  if (['py', 'java', 'ts', 'tsx', 'js'].includes(extension)) return FileCode2;
  if (extension === 'md') return FileText;
  if (['yml', 'yaml', 'toml', 'ini', 'json'].includes(extension) || node.name === 'Dockerfile') return FileCog;
  return File;
};

/** Directories first, then files, each alphabetically. */
const sortNodes = (nodes: FileNode[]) => [...nodes].sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);

function ancestorsOf(path: string): string[] {
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join('/'));
}

/**
 * File tree as a WAI-ARIA tree: arrow keys move and open, Enter opens a file. A filter shows matching files with their
 * folders open. Each file carries its documentation coverage when an analysis is loaded.
 */
export function FileTree({ tree, selected, onOpen, coverage }: { tree: FileNode[]; selected: string | null; onOpen: (path: string) => void; coverage: Map<string, number | null> | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(selected ? ancestorsOf(selected) : []));
  const [filter, setFilter] = useState('');
  const [focused, setFocused] = useState<string | null>(selected);
  const list = useRef<HTMLDivElement>(null);
  /** Opening a file from outside the tree (a link, the palette) reveals it. */
  useEffect(() => {
    if (!selected) return;
    setOpen(current => { const missing = ancestorsOf(selected).filter(path => !current.has(path)); return missing.length ? new Set([...current, ...missing]) : current; });
    setFocused(selected);
  }, [selected]);

  const needle = filter.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle) return null;
    const keep = new Set<string>();
    const walk = (nodes: FileNode[]) => nodes.forEach(node => {
      if (node.type === 'file' && node.path.toLowerCase().includes(needle)) { keep.add(node.path); ancestorsOf(node.path).forEach(path => keep.add(path)); }
      if (node.children) walk(node.children);
    });
    walk(tree);
    return keep;
  }, [tree, needle]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const walk = (nodes: FileNode[], depth: number, parent: string | null) => sortNodes(nodes).forEach(node => {
      if (matches && !matches.has(node.path)) return;
      out.push({ node, depth, parent });
      if (node.type === 'directory' && (matches || open.has(node.path))) walk(node.children ?? [], depth + 1, node.path);
    });
    walk(tree, 1, null);
    return out;
  }, [tree, open, matches]);
  const fileCount = useMemo(() => rows.filter(row => row.node.type === 'file').length, [rows]);

  const focusRow = (path: string) => {
    setFocused(path);
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`)?.focus());
  };
  const toggle = (path: string, value?: boolean) => setOpen(current => {
    const next = new Set(current);
    if (value ?? !next.has(path)) next.add(path); else next.delete(path);
    return next;
  });
  const activeRow = rows.some(row => row.node.path === focused) ? focused : rows[0]?.node.path ?? null;

  return <div className="ex-tree" data-testid="file-tree">
    <label className="ex-filter">
      <Search size={13} aria-hidden="true" />
      <span className="sr-only">Filter files</span>
      <input type="search" value={filter} placeholder="Filter files" spellCheck={false} data-testid="tree-filter" onChange={event => setFilter(event.target.value)}
        onKeyDown={event => { if (event.key === 'ArrowDown' && rows[0]) { event.preventDefault(); focusRow(rows[0].node.path); } }} />
      {filter && <button type="button" className="icon-button small" aria-label="Clear filter" onClick={() => setFilter('')}><X size={12} /></button>}
    </label>
    {needle && <p className="ex-tree-count" role="status" data-testid="tree-count">{fileCount ? `${fileCount} matching file${fileCount === 1 ? '' : 's'}` : 'No file matches'}</p>}
    <div ref={list} role="tree" aria-label="Repository files" className="ex-tree-rows">
      {rows.map((row, index) => {
        const { node } = row;
        const directory = node.type === 'directory';
        const expanded = directory ? !!matches || open.has(node.path) : undefined;
        const Icon = directory ? (expanded ? FolderOpen : Folder) : iconFor(node)!;
        const value = !directory && coverage ? coverage.get(node.path) ?? null : undefined;
        return <div key={node.path} role="treeitem" aria-level={row.depth} aria-expanded={expanded} aria-selected={node.path === selected} data-path={node.path} data-testid={directory ? 'tree-dir' : 'tree-file'}
          tabIndex={node.path === activeRow ? 0 : -1} className={`ex-row${node.path === selected ? ' selected' : ''}`} style={{ paddingLeft: 8 + (row.depth - 1) * 14 }}
          onFocus={() => setFocused(node.path)}
          onClick={() => { setFocused(node.path); if (directory) toggle(node.path); else onOpen(node.path); }}
          onKeyDown={event => {
            const move = (to: number) => { const target = rows[Math.max(0, Math.min(rows.length - 1, to))]; if (target) focusRow(target.node.path); };
            if (event.key === 'ArrowDown') { event.preventDefault(); move(index + 1); }
            else if (event.key === 'ArrowUp') { event.preventDefault(); move(index - 1); }
            else if (event.key === 'Home') { event.preventDefault(); move(0); }
            else if (event.key === 'End') { event.preventDefault(); move(rows.length - 1); }
            else if (event.key === 'ArrowRight' && directory) { event.preventDefault(); if (!expanded) toggle(node.path, true); else if (rows[index + 1]?.parent === node.path) move(index + 1); }
            else if (event.key === 'ArrowLeft') { event.preventDefault(); if (directory && expanded && !matches) toggle(node.path, false); else if (row.parent) focusRow(row.parent); }
            else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (directory) toggle(node.path); else onOpen(node.path); }
          }}>
          {directory ? <ChevronRight size={12} className={`ex-chevron${expanded ? ' open' : ''}`} aria-hidden="true" /> : <span className="ex-chevron-space" />}
          <Icon size={14} aria-hidden="true" style={{ color: `var(${directory ? '--text-mid' : languageColor(node.language)})` }} />
          <span className="ex-name">{node.name}</span>
          {value !== undefined && <span className={`ex-dot ${coverageTone(value)}`} title={value === null ? 'No documentable symbols' : `${value}% documented`}><span className="sr-only">{value === null ? ', no documentable symbols' : `, ${value}% documented`}</span></span>}
        </div>;
      })}
    </div>
  </div>;
}
