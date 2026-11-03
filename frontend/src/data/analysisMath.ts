/** Graph and naming helpers shared by the demo fixture and the pages. Kept out of the demo chunk so Live never loads it. */
export function namingPattern(identifier: string): string {
  if (/^[A-Z][A-Z0-9_]*$/.test(identifier) && identifier.includes('_')) return 'UPPER_CASE';
  if (/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(identifier)) return 'snake_case';
  if (/^[A-Z][a-zA-Z0-9]*$/.test(identifier) && /[a-z]/.test(identifier)) return 'PascalCase';
  if (/^[a-z]+[A-Z][a-zA-Z0-9]*$/.test(identifier)) return 'camelCase';
  return 'other';
}

/** Strongly connected components of size two or more, which are the import cycles. */
export function importCycles(edges: { source: string; target: string }[]): string[][] {
  const out = new Map<string, string[]>();
  edges.forEach(edge => { if (!out.has(edge.source)) out.set(edge.source, []); out.get(edge.source)!.push(edge.target); });
  const index = new Map<string, number>(), low = new Map<string, number>(), stack: string[] = [], onStack = new Set<string>(), cycles: string[][] = [];
  let next = 0;
  const visit = (node: string) => {
    index.set(node, next); low.set(node, next); next += 1; stack.push(node); onStack.add(node);
    for (const target of out.get(node) ?? []) {
      if (!index.has(target)) { visit(target); low.set(node, Math.min(low.get(node)!, low.get(target)!)); }
      else if (onStack.has(target)) low.set(node, Math.min(low.get(node)!, index.get(target)!));
    }
    if (low.get(node) === index.get(node)) {
      const component: string[] = [];
      let member: string;
      do { member = stack.pop()!; onStack.delete(member); component.push(member); } while (member !== node);
      if (component.length > 1) cycles.push(component.sort());
    }
  };
  [...out.keys()].sort().forEach(node => { if (!index.has(node)) visit(node); });
  return cycles;
}
