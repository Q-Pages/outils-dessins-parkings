// src/store/projectStore.ts
import { create } from 'zustand';
import { LatLng } from '../geometry/projection';
import { DEFAULT_SOLVER_PARAMS, ParkingConfig, SolverParams } from '../geometry/types';

interface ProjectState {
  boundary: LatLng[];
  exclusions: LatLng[][];
  accessPoints: LatLng[];
  params: SolverParams;
  configs: ParkingConfig[];
  selectedConfigIndex: number;

  setBoundary: (boundary: LatLng[]) => void;
  setExclusions: (exclusions: LatLng[][]) => void;
  setAccessPoints: (points: LatLng[]) => void;
  setParams: (params: Partial<SolverParams>) => void;
  setConfigs: (configs: ParkingConfig[]) => void;
  selectConfig: (index: number) => void;
  loadProject: (data: { boundary: LatLng[]; exclusions: LatLng[][]; accessPoints: LatLng[]; params: SolverParams }) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  boundary: [],
  exclusions: [],
  accessPoints: [],
  params: DEFAULT_SOLVER_PARAMS,
  configs: [],
  selectedConfigIndex: 0,

  setBoundary: (boundary) => set({ boundary }),
  setExclusions: (exclusions) => set({ exclusions }),
  setAccessPoints: (points) => set({ accessPoints: points }),
  setParams: (params) => set((state) => ({ params: { ...state.params, ...params } })),
  setConfigs: (configs) => set({ configs, selectedConfigIndex: 0 }),
  selectConfig: (index) => set({ selectedConfigIndex: index }),
  loadProject: (data) => set({ ...data, configs: [], selectedConfigIndex: 0 }),
}));
