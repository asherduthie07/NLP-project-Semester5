/**
 * Rule-based line matching for claims. Each rule recognizes one kind of statement in a claim and searches the symbol's
 * own lines for text that bears on it. It points a reviewer at lines. It is not the verifier, it does not decide a
 * claim's status, and a match is not proof that the claim is true.
 */
export interface EvidenceRule { id: string; assertion: string; support: RegExp; contradict?: RegExp; contradictReason?: string }
export interface Evidence { rule: EvidenceRule | null; support: number[]; contradict: number[] }

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function ruleFor(claim: string): EvidenceRule | null {
  const raised = claim.match(/\braises\s+([A-Za-z_][\w.]*)/);
  if (raised) return { id: 'raises', assertion: `raises ${raised[1]}`, support: new RegExp(`\\b(raise|throw)\\s+(new\\s+)?${escape(raised[1])}\\b`) };
  if (/emits? (a )?(domain )?event/i.test(claim)) return { id: 'event', assertion: 'publishes an event', support: /\bevents?\.publish\(|\bemit\(/ };
  if (/caller'?s transaction/i.test(claim)) return { id: 'transaction', assertion: "writes inside the caller's transaction", support: /caller's transaction|\bsession\.flush\(\)/, contradict: /\.commit\(\)/, contradictReason: 'commits its own transaction' };
  if (/idempotency key|safe to retry/i.test(claim)) return { id: 'idempotent', assertion: 'is safe to retry', support: /idempoten|retries are safe/i };
  if (/authenticated|requires auth|permission/i.test(claim)) return { id: 'auth', assertion: 'requires an authenticated session', support: /current_user|authenticat|permission|require_\w+\(/i };
  if (/paginated|ordered by/i.test(claim)) return { id: 'paginated', assertion: 'returns a paginated, ordered result', support: /paginat|order_by\(|\.limit\(|\boffset\b/i, contradict: /^\s*return\s+record\s*$/, contradictReason: 'returns a single record' };
  return null;
}

/** `lines` is the whole file; `start` and `end` bound the symbol's span (1-based, inclusive). */
export function locateEvidence(claim: string, lines: string[], start: number, end: number): Evidence {
  const rule = ruleFor(claim);
  const support: number[] = [], contradict: number[] = [];
  if (rule) for (let line = start; line <= Math.min(end, lines.length); line += 1) {
    const text = lines[line - 1];
    if (rule.support.test(text)) support.push(line);
    else if (rule.contradict?.test(text)) contradict.push(line);
  }
  return { rule, support, contradict };
}
