import { create } from 'zustand';
import type { PhaseOneApi } from '../data/api';
import { createMockApi } from '../data/mock';

interface AdapterState { api: PhaseOneApi; setApi: (api: PhaseOneApi) => void; }
export const useAdapter = create<AdapterState>(set => ({ api: createMockApi(), setApi: api => set({ api }) }));
