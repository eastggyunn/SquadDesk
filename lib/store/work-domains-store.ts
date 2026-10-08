"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface WorkDomain {
  id: string;
  label: string;
}

export const WORK_DOMAINS_STORE_KEY = "extraction-ops-work-domains";

interface WorkDomainsState {
  domains: WorkDomain[];
  addDomain: (label: string) => WorkDomain;
  removeDomain: (domainId: string) => void;
  reorderDomains: (startIndex: number, endIndex: number) => void;
}

const DEFAULT_DOMAINS: WorkDomain[] = [
  { id: "domain-client-programming", label: "클라이언트 프로그래밍" },
  { id: "domain-server", label: "서버" },
  { id: "domain-ui-ux-art", label: "UI/UX 아트" },
  { id: "domain-sound", label: "사운드/오디오" },
  { id: "domain-game-design", label: "게임 기획" },
];

export const useWorkDomainsStore = create<WorkDomainsState>()(
  persist(
    (set) => ({
      domains: DEFAULT_DOMAINS,

      addDomain: (label) => {
        const domain: WorkDomain = { id: crypto.randomUUID(), label };
        set((state) => ({ domains: [...state.domains, domain] }));
        return domain;
      },

      removeDomain: (domainId) => {
        set((state) => ({ domains: state.domains.filter((domain) => domain.id !== domainId) }));
      },

      reorderDomains: (startIndex, endIndex) => {
        set((state) => {
          const next = [...state.domains];
          const [moved] = next.splice(startIndex, 1);
          next.splice(endIndex, 0, moved);
          return { domains: next };
        });
      },
    }),
    { name: WORK_DOMAINS_STORE_KEY }
  )
);
