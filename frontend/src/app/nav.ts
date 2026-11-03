import { BadgeCheck, BookOpenText, Brain, CircleHelp, FileOutput, FolderTree, LayoutDashboard, Network, Settings, type LucideIcon } from 'lucide-react';

export interface Destination {
  id: string;
  path: string;
  label: string;
  /** Second key of the "g" navigation sequence. */
  key: string;
  icon: LucideIcon;
  group: 'main' | 'utility';
  /** Milestone that builds the page. Null means it works now. */
  milestone: string | null;
  summary: string;
  /** Planned contents, taken from the UI specification. Shown only as plans. */
  planned: string[];
}

export const destinations: Destination[] = [
  { id: 'overview', path: '/app/overview', label: 'Overview', key: 'o', icon: LayoutDashboard, group: 'main', milestone: null, summary: 'Repository health at a glance.', planned: ['KPI cards with sparklines and deltas', 'Coverage over time and claim status charts', 'Language and documentation completeness', 'Activity feed that scrolls on its own and pauses on hover', 'Terminal, checklist and architecture mini-map panels'] },
  { id: 'explorer', path: '/app/explorer', label: 'Codebase Explorer', key: 'e', icon: FolderTree, group: 'main', milestone: 'M5', summary: 'Files, source and symbol detail, side by side.', planned: ['Virtualized file tree with coverage dots', 'Highlighted source viewer with inline doc glyphs', 'Inspector tabs: Explanation, Signature, Relationships, Docs'] },
  { id: 'graph', path: '/app/graph', label: 'Knowledge Graph', key: 'k', icon: Network, group: 'main', milestone: 'M4', summary: 'Modules, classes and functions as a navigable graph.', planned: ['Canvas graph of 600+ nodes, colored by cluster', 'Control panel for forces, labels, hulls and heatmap', 'Minimap, search and node inspector'] },
  { id: 'docs', path: '/app/docs', label: 'Documentation Studio', key: 'd', icon: BookOpenText, group: 'main', milestone: 'M5', summary: 'Generated documentation, reviewed against source.', planned: ['Tree of generated documents', 'Editor with live preview', 'Quality scores and accept or regenerate actions'] },
  { id: 'intelligence', path: '/app/intelligence', label: 'Documentation Intelligence', key: 'i', icon: Brain, group: 'main', milestone: 'M5', summary: 'What the documentation says and how it is written.', planned: ['Word cloud and term frequency', 'Topic and readability charts', 'Coverage gaps by module'] },
  { id: 'verification', path: '/app/verification', label: 'Verification', key: 'v', icon: BadgeCheck, group: 'main', milestone: 'M5', summary: 'Every claim traced back to the source that supports it.', planned: ['Claim table with status filters', 'Evidence and code side by side', 'Verification run log'] },
  { id: 'exports', path: '/app/exports', label: 'Exports', key: 'x', icon: FileOutput, group: 'main', milestone: 'M5', summary: 'Documentation and reports in portable formats.', planned: ['Format and scope selection', 'Export history and downloads'] },
  { id: 'settings', path: '/app/settings', label: 'Settings', key: 's', icon: Settings, group: 'utility', milestone: null, summary: 'Data source, visualization and navigation preferences.', planned: [] },
  { id: 'help', path: '/app/help', label: 'Help', key: 'h', icon: CircleHelp, group: 'utility', milestone: null, summary: 'Shortcuts, what is built so far and what each data mode means.', planned: [] },
];

export const destinationAt = (pathname: string) => destinations.find(item => pathname === item.path || pathname.startsWith(`${item.path}/`));
