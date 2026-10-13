import { create } from "zustand";

export type AuthPhase = "idle" | "sealing" | "error" | "success";

interface AuthSceneState {
  phase: AuthPhase;
  /** Bumps on every failure so two errors in a row still replay the shake. */
  errorCount: number;
  setPhase: (phase: AuthPhase) => void;
}

export const useAuthScene = create<AuthSceneState>()((set) => ({
  phase: "idle",
  errorCount: 0,
  setPhase: (phase) =>
    set((s) => ({ phase, errorCount: phase === "error" ? s.errorCount + 1 : s.errorCount })),
}));

export const authScene = {
  sealing: () => useAuthScene.getState().setPhase("sealing"),
  failed: () => useAuthScene.getState().setPhase("error"),
  done: () => useAuthScene.getState().setPhase("success"),
  idle: () => useAuthScene.getState().setPhase("idle"),
};
