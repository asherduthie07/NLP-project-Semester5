/**
 * Facts read directly from source text: parameters, return statements, calls, raised errors and the existing docstring.
 * This is plain parsing of the file that is on screen. It does not interpret meaning, and it is not a model output.
 */
export interface Param { name: string; type: string | null; defaultValue: string | null }
export interface LineFact { line: number; text: string }
export interface SourceFacts {
  declaration: LineFact | null;
  params: Param[];
  returnType: string | null;
  returns: LineFact[];
  calls: LineFact[];
  raises: LineFact[];
  docstring: { text: string; line: number; endLine: number } | null;
}

const KEYWORDS = new Set(['if', 'for', 'while', 'return', 'print', 'elif', 'and', 'or', 'not', 'in', 'with', 'assert', 'switch', 'catch', 'new', 'super', 'this', 'def', 'class', 'lambda', 'yield', 'await', 'raise', 'throw']);

/** Splits on commas outside brackets and quotes. */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0, quote: string | null = null, current = '';
  for (const char of text) {
    if (quote) { current += char; if (char === quote) quote = null; continue; }
    if (char === '"' || char === "'") quote = char;
    else if ('([{<'.includes(char)) depth += 1;
    else if (')]}>'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) { parts.push(current.trim()); current = ''; continue; }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseParams(signature: string, language: string): Param[] {
  return splitTopLevel(signature).filter(part => part && part !== 'self' && part !== 'cls' && part !== '*' && part !== '/').map(part => {
    if (language === 'java') {
      const clean = part.replace(/@\w+\s*/g, '').replace(/\bfinal\s+/, '').trim();
      const name = clean.split(/\s+/).pop() ?? clean;
      return { name, type: clean.slice(0, clean.length - name.length).trim() || null, defaultValue: null };
    }
    const [head, defaultValue = null] = part.split(/=(.*)/s).map(value => value?.trim() ?? null);
    const [name, type = null] = head!.split(/:(.*)/s).map(value => value?.trim() ?? null);
    return { name: name!, type: type || null, defaultValue: defaultValue || null };
  });
}

/**
 * Facts for the symbol spanning `line` to `endLine` (1-based, inclusive). Calls inside nested definitions count, since
 * they are part of the span the reader sees.
 */
export function extractFacts(lines: string[], line: number, endLine: number, language: string | null): SourceFacts {
  const java = language?.toLowerCase() === 'java';
  const start = Math.max(1, line), end = Math.min(lines.length, Math.max(endLine, line));
  const at = (number: number) => lines[number - 1] ?? '';
  const facts: SourceFacts = { declaration: null, params: [], returnType: null, returns: [], calls: [], raises: [], docstring: null };
  if (start > lines.length) return facts;

  /** The declaration can span several lines until its parameter list closes. */
  let header = '', headerEnd = start;
  for (let number = start; number <= end; number += 1) {
    header += `${at(number).trim()} `;
    headerEnd = number;
    if ((header.match(/\(/g)?.length ?? 0) <= (header.match(/\)/g)?.length ?? 0) && /[:{;]\s*$|\)\s*$/.test(header.trim())) break;
  }
  facts.declaration = { line: start, text: header.trim() };
  const params = header.match(/\((.*)\)/s);
  if (params) facts.params = parseParams(params[1], java ? 'java' : 'python');
  facts.returnType = java ? header.match(/(?:public|private|protected|static|\s)+([\w<>[\], ?]+)\s+\w+\s*\(/)?.[1]?.trim() ?? null : header.match(/->\s*([^:]+):\s*$/)?.[1]?.trim() ?? null;

  if (!java) {
    const first = headerEnd + 1, text = at(first).trim();
    const opener = text.match(/^[rbuRBU]?("""|''')/);
    if (opener) {
      const quote = opener[1];
      let body = text.slice(opener[0].length), close = first;
      while (!body.includes(quote) && close < end) { close += 1; body += `\n${at(close).trim()}`; }
      facts.docstring = { text: body.slice(0, body.indexOf(quote) >= 0 ? body.indexOf(quote) : undefined).trim(), line: first, endLine: close };
    }
  } else {
    let close = start - 1;
    while (close >= 1 && /^\s*@/.test(at(close))) close -= 1;
    if (/\*\/\s*$/.test(at(close))) {
      let open = close;
      while (open > 1 && !/\/\*\*/.test(at(open))) open -= 1;
      const text = lines.slice(open - 1, close).map(value => value.replace(/^\s*\/?\*+\/?\s?/, '').replace(/\*\/\s*$/, '')).join('\n').trim();
      facts.docstring = { text, line: open, endLine: close };
    }
  }

  const ownName = header.match(java ? /(\w+)\s*\(/ : /(?:def|class)\s+(\w+)/)?.[1];
  for (let number = headerEnd + 1; number <= end; number += 1) {
    const source = at(number);
    const trimmed = source.trim();
    if (facts.docstring && number >= facts.docstring.line && number <= facts.docstring.endLine) continue;
    if (trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const returned = trimmed.match(/^return\b\s*(.*?);?$/);
    if (returned) facts.returns.push({ line: number, text: returned[1] || '(nothing)' });
    const raised = trimmed.match(/^(?:raise|throw)\s+(?:new\s+)?([\w.]+)/);
    if (raised) facts.raises.push({ line: number, text: raised[1] });
    for (const match of trimmed.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""').matchAll(/([A-Za-z_][\w.]*)\s*\(/g)) {
      const name = match[1];
      if (KEYWORDS.has(name) || name === ownName || (raised && name.endsWith(raised[1]))) continue;
      facts.calls.push({ line: number, text: name });
    }
  }
  return facts;
}

/** Unique call names in first-seen order. */
export const uniqueCalls = (facts: SourceFacts) => [...new Map(facts.calls.map(call => [call.text, call])).values()];
