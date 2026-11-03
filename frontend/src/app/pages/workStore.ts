import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Work the user does in this browser: claim review decisions and export history.
 * Records are kept per data source and snapshot, so demo decisions never appear against a live repository.
 */
export type ReviewDecision = 'approved' | 'rejected' | 'uncertain';
export type ExportFormat = 'markdown-zip' | 'static-site' | 'pdf' | 'json-report' | 'csv-modules';
export interface ExportRecord { id: string; scope: string; format: ExportFormat; fileName: string; bytes: number; items: number; at: string; status: 'complete' | 'failed'; note: string }

interface WorkStore {
  reviews: Record<string, Record<string, ReviewDecision>>;
  exports: ExportRecord[];
  review: (scope: string, claimId: string, decision: ReviewDecision | null) => void;
  recordExport: (record: ExportRecord) => void;
  clearExports: (scope: string) => void;
}

export const useWorkStore = create<WorkStore>()(persist(set => ({
  reviews: {},
  exports: [],
  review: (scope, claimId, decision) => set(state => {
    const current = { ...(state.reviews[scope] ?? {}) };
    if (decision) current[claimId] = decision; else delete current[claimId];
    return { reviews: { ...state.reviews, [scope]: current } };
  }),
  recordExport: record => set(state => ({ exports: [record, ...state.exports].slice(0, 100) })),
  clearExports: scope => set(state => ({ exports: state.exports.filter(item => item.scope !== scope) })),
}), { name: 'codeatlas.work.v1', storage: createJSONStorage(() => localStorage) }));

const EMPTY: Record<string, ReviewDecision> = {};
export const useReviews = (scope: string) => useWorkStore(state => state.reviews[scope] ?? EMPTY);
