import { afterEach, expect, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import * as matchers from '@testing-library/jest-dom/matchers';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/** jest-dom's own vitest entry declares Assertion with a different arity from Vitest 5, so the matchers are registered here. */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars
  interface Matchers<R, T> extends TestingLibraryMatchers<unknown, R> {}
}
expect.extend(matchers);

const tokens: Record<string, string> = {
  '--bg-0': '#060912', '--bg-1': '#0A1020', '--bg-2': '#101933', '--bg-3': '#16213f', '--line': 'rgba(120,160,255,.12)', '--line-strong': 'rgba(120,180,255,.28)',
  '--text-hi': '#EAF1FF', '--text-mid': '#9DB0D3', '--text-low': '#5F7196', '--blue': '#3B82F6', '--cyan': '#22D3EE', '--violet': '#8B5CF6', '--mint': '#34D399', '--amber': '#F5B642', '--coral': '#FB7185', '--pink': '#F472B6',
  '--cluster-1': '#86EFAC', '--cluster-2': '#FDBA74', '--cluster-3': '#FCA5A5', '--cluster-4': '#60A5FA', '--cluster-5': '#C4B5FD', '--cluster-6': '#93C5FD', '--cluster-7': '#F9A8D4', '--cluster-8': '#67E8F9',
};
Object.entries(tokens).forEach(([token, value]) => document.documentElement.style.setProperty(token, value));

vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
vi.stubGlobal('IntersectionObserver', class { observe() { return undefined; } unobserve() { return undefined; } disconnect() { return undefined; } });
vi.stubGlobal('ResizeObserver', class { observe() { return undefined; } unobserve() { return undefined; } disconnect() { return undefined; } });
/** jsdom has no canvas backend; the code under test handles a null context. */
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];

afterEach(() => { cleanup(); localStorage.clear(); });
