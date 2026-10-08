"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Attachment } from "@/lib/types";

export interface SyncedAssetCategory {
  id: string;
  label: string;
}

export interface SyncedAsset {
  categoryId: string;
  attachment: Attachment;
  /** Where this file came from: a task title, or a manual dashboard upload label. */
  sourceLabel: string;
  updatedAt: string;
}

export const SYNCED_ASSETS_STORE_KEY = "extraction-ops-synced-assets";

interface SyncedAssetsState {
  categories: SyncedAssetCategory[];
  assets: Record<string, SyncedAsset>;
  addCategory: (label: string) => SyncedAssetCategory;
  removeCategory: (categoryId: string) => void;
  syncAsset: (categoryId: string, attachment: Attachment, sourceLabel: string) => void;
  renameAsset: (categoryId: string, name: string) => void;
}

const DEFAULT_CATEGORIES: SyncedAssetCategory[] = [
  { id: "cat-client-build", label: "최신 클라이언트 빌드(.zip)" },
  { id: "cat-master-datatable", label: "마스터 데이터 테이블(.xlsx)" },
  { id: "cat-lobby-figma", label: "로비 UI 시안(Figma)" },
  { id: "cat-slime-spine", label: "슬라임 애니메이션(.spine)" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export const useSyncedAssetsStore = create<SyncedAssetsState>()(
  persist(
    (set) => ({
      categories: DEFAULT_CATEGORIES,
      assets: {
        "cat-slime-spine": {
          categoryId: "cat-slime-spine",
          attachment: { id: "att-1", name: "slime_run.spine", kind: "spine" },
          sourceLabel: "슬라임 몬스터 돌진 AI FSM 구현",
          updatedAt: "2026-07-20",
        },
        "cat-lobby-figma": {
          categoryId: "cat-lobby-figma",
          attachment: {
            id: "att-2",
            name: "로비 UI Figma 시안",
            kind: "figma",
            url: "https://figma.com/file/lobby-ui",
          },
          sourceLabel: "로비 UI 피그마 시안 깎기",
          updatedAt: "2026-07-19",
        },
      },
      addCategory: (label) => {
        const category: SyncedAssetCategory = { id: crypto.randomUUID(), label };
        set((state) => ({ categories: [...state.categories, category] }));
        return category;
      },
      removeCategory: (categoryId) => {
        set((state) => {
          const remainingAssets = { ...state.assets };
          delete remainingAssets[categoryId];
          return {
            categories: state.categories.filter((category) => category.id !== categoryId),
            assets: remainingAssets,
          };
        });
      },
      syncAsset: (categoryId, attachment, sourceLabel) => {
        set((state) => ({
          assets: {
            ...state.assets,
            [categoryId]: {
              categoryId,
              attachment,
              sourceLabel,
              updatedAt: today(),
            },
          },
        }));
      },
      renameAsset: (categoryId, name) => {
        set((state) => {
          const existing = state.assets[categoryId];
          if (!existing) return state;
          return {
            assets: {
              ...state.assets,
              [categoryId]: {
                ...existing,
                attachment: { ...existing.attachment, name },
                updatedAt: today(),
              },
            },
          };
        });
      },
    }),
    { name: SYNCED_ASSETS_STORE_KEY }
  )
);

export function findSyncedCategory(
  assets: Record<string, SyncedAsset>,
  categories: SyncedAssetCategory[],
  attachmentId: string
): SyncedAssetCategory | undefined {
  const entry = Object.values(assets).find((asset) => asset.attachment.id === attachmentId);
  if (!entry) return undefined;
  return categories.find((category) => category.id === entry.categoryId);
}
