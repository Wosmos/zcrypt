import { create } from "zustand";
import type { QuotaInfo } from "@/types";

interface QuotaStore {
  quota: QuotaInfo | null;
  setQuota: (quota: QuotaInfo | null) => void;
}

export const useQuotaStore = create<QuotaStore>((set) => ({
  quota: null,
  setQuota: (quota) => set({ quota }),
}));
