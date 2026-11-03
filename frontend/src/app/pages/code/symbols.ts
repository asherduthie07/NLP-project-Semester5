import type { AnalysisRelation, AnalysisSymbol, RepositoryAnalysis } from '../../../data/dashboard';
import type { ColorToken } from '../../../viz/types';
import { isDocumentable } from '../derive';

/** Symbol lookups shared by the Explorer, Docs Studio and Verification. */
export const LANGUAGE_COLOR: Record<string, ColorToken> = { Python: '--blue', Java: '--amber', TypeScript: '--cyan', JavaScript: '--amber', YAML: '--violet', TOML: '--pink', Markdown: '--mint', Dockerfile: '--cyan', INI: '--pink' };
export const languageColor = (language: string | null | undefined): ColorToken => (language && LANGUAGE_COLOR[language]) || '--text-low';

export function symbolsIn(analysis: RepositoryAnalysis, path: string): AnalysisSymbol[] {
  return analysis.symbols.filter(symbol => symbol.path === path && symbol.kind !== 'module').sort((a, b) => a.line - b.line || b.endLine - a.endLine);
}

/** The innermost symbol whose span holds the line. */
export function symbolAt(symbols: AnalysisSymbol[], line: number): AnalysisSymbol | null {
  let best: AnalysisSymbol | null = null;
  for (const symbol of symbols) if (symbol.line <= line && line <= symbol.endLine && (!best || symbol.endLine - symbol.line <= best.endLine - best.line)) best = symbol;
  return best;
}

/** The chain of enclosing symbols, outermost first. */
export function ancestry(analysis: RepositoryAnalysis, symbol: AnalysisSymbol): AnalysisSymbol[] {
  const byId = new Map(analysis.symbols.map(entry => [entry.id, entry]));
  const chain: AnalysisSymbol[] = [];
  for (let current: AnalysisSymbol | undefined = symbol; current && current.kind !== 'module'; current = current.parentId ? byId.get(current.parentId) : undefined) chain.unshift(current);
  return chain;
}

export interface RelationView { relation: AnalysisRelation; direction: 'out' | 'in'; other: AnalysisSymbol | null; label: string }
/** Every relationship that starts or ends at the symbol, with the far end resolved when the record has it. */
export function relationsOf(analysis: RepositoryAnalysis, symbol: AnalysisSymbol): RelationView[] {
  const byId = new Map(analysis.symbols.map(entry => [entry.id, entry]));
  const files = new Map(analysis.files.map(file => [file.id, file.path]));
  const name = (id: string | null, fallback: string) => id ? byId.get(id)?.qualifiedName ?? files.get(id) ?? fallback : fallback;
  return analysis.relations.flatMap((relation): RelationView[] => {
    if (relation.source === symbol.id) return [{ relation, direction: 'out' as const, other: relation.target ? byId.get(relation.target) ?? null : null, label: name(relation.target, relation.targetName) }];
    if (relation.target === symbol.id) return [{ relation, direction: 'in' as const, other: byId.get(relation.source) ?? null, label: name(relation.source, relation.source) }];
    return [];
  });
}

/** File-level coverage: documented share of the file's documentable symbols, or null when it has none. */
export function fileCoverage(analysis: RepositoryAnalysis): Map<string, number | null> {
  const counts = new Map<string, { documented: number; total: number }>();
  analysis.symbols.forEach(symbol => {
    if (!isDocumentable(symbol.kind)) return;
    const entry = counts.get(symbol.path) ?? { documented: 0, total: 0 };
    entry.total += 1;
    if (symbol.documented) entry.documented += 1;
    counts.set(symbol.path, entry);
  });
  return new Map(analysis.files.map(file => {
    const entry = counts.get(file.path);
    return [file.path, entry?.total ? Math.round(entry.documented / entry.total * 100) : null];
  }));
}

export const coverageTone = (coverage: number | null) => coverage === null ? 'none' : coverage >= 70 ? 'good' : coverage >= 40 ? 'fair' : 'poor';
export const shortKind = (kind: string) => kind === 'function' ? 'fn' : kind === 'method' ? 'm' : kind === 'class' ? 'C' : kind.slice(0, 2);
