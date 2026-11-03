import type { HighlighterCore } from 'shiki/core';

/**
 * Shiki, loaded on first use with only the grammars the app needs. The theme maps every token kind to a CSS variable,
 * so syntax colors follow the design tokens and the light and dark themes without a second highlighter.
 */
export interface CodeToken { content: string; color: string | null }
export type CodeLines = CodeToken[][];

const LANGS: Record<string, () => Promise<unknown>> = {
  python: () => import('shiki/langs/python.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  docker: () => import('shiki/langs/docker.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
};
const BY_EXTENSION: Record<string, string> = { py: 'python', java: 'java', ts: 'typescript', tsx: 'typescript', js: 'javascript', yml: 'yaml', yaml: 'yaml', toml: 'toml', md: 'markdown', json: 'json', ini: 'ini' };

/** Grammar for a path, or null for plain text. */
export function grammarFor(path: string, language?: string | null): string | null {
  if (/(^|\/)Dockerfile$/.test(path)) return 'docker';
  const byExtension = BY_EXTENSION[path.split('.').pop()!.toLowerCase()];
  if (byExtension) return byExtension;
  const named = language?.toLowerCase();
  return named && named in LANGS ? named : null;
}

let highlighter: Promise<HighlighterCore> | null = null;
const loaded = new Set<string>();

async function load(): Promise<HighlighterCore> {
  highlighter ??= Promise.all([import('shiki/core'), import('shiki/engine/javascript')]).then(([core, engine]) => core.createHighlighterCore({
    themes: [core.createCssVariablesTheme({ name: 'codeatlas', variablePrefix: '--shiki-', variableDefaults: {} })],
    langs: [],
    engine: engine.createJavaScriptRegexEngine(),
  }));
  return highlighter;
}

const plain = (code: string): CodeLines => code.split('\n').map(line => [{ content: line, color: null }]);

/** Tokenizes code into lines. Unknown languages and grammar failures fall back to plain lines, never to an error. */
export async function highlight(code: string, path: string, language?: string | null): Promise<CodeLines> {
  const grammar = grammarFor(path, language);
  if (!grammar) return plain(code);
  try {
    const core = await load();
    if (!loaded.has(grammar)) { await core.loadLanguage((await LANGS[grammar]()) as Parameters<HighlighterCore['loadLanguage']>[0]); loaded.add(grammar); }
    return core.codeToTokens(code, { lang: grammar, theme: 'codeatlas' }).tokens.map(line => line.map(token => ({ content: token.content, color: token.color ?? null })));
  } catch {
    return plain(code);
  }
}

/** Lines of a file without the empty entry a trailing newline leaves. */
export function splitLines(code: string): string[] {
  const lines = code.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}
