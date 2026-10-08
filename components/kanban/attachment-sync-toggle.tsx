"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useSyncedAssetsStore, type SyncedAssetCategory } from "@/lib/store/synced-assets-store";
import { primaryButtonSm } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";
import { Select } from "@/components/ui/select";

export interface PendingSync {
  enabled: boolean;
  categoryId: string | null;
}

interface AttachmentSyncToggleProps {
  pending: PendingSync;
  onChange: (next: PendingSync) => void;
  /**
   * 주어지면(Supabase 모드) Zustand 목업 카테고리 대신 이 실데이터 목록을 쓴다.
   * 카테고리 생성은 대시보드 위젯에서만 하므로, 이 값이 주어지면 "새 카테고리
   * 추가" 빠른 생성 UI는 숨긴다(목업 store에만 쓰는 별개 카테고리가 생기는 것을
   * 막기 위함).
   */
  categories?: SyncedAssetCategory[];
}


export function AttachmentSyncToggle({ pending, onChange, categories: categoriesOverride }: AttachmentSyncToggleProps) {
  const mockCategories = useSyncedAssetsStore((state) => state.categories);
  const mockAddCategory = useSyncedAssetsStore((state) => state.addCategory);
  const isSupabaseMode = categoriesOverride !== undefined;
  const categories = categoriesOverride ?? mockCategories;
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  function handleToggle() {
    const nextEnabled = !pending.enabled;
    onChange({
      enabled: nextEnabled,
      categoryId: nextEnabled ? (pending.categoryId ?? categories[0]?.id ?? null) : null,
    });
    if (!nextEnabled) setIsAddingCategory(false);
  }

  function handleCreateCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    const category = mockAddCategory(trimmed);
    onChange({ enabled: true, categoryId: category.id });
    setNewCategoryName("");
    setIsAddingCategory(false);
  }

  return (
    <div className="mt-2">
      <label className="flex items-center gap-2 text-xs font-medium text-zinc-400">
        <input
          type="checkbox"
          checked={pending.enabled}
          onChange={handleToggle}
          className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-950 text-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:ring-offset-0"
        />
        대시보드 통합 파일로 갱신
      </label>

      <AnimatePresence initial={false}>
        {pending.enabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING.collapse}
            className="overflow-hidden"
          >
            <div className="mt-2 flex items-center gap-2">
              <Select
                aria-label="덮어쓸 대상"
                value={pending.categoryId ?? ""}
                onChange={(next) => onChange({ enabled: true, categoryId: next })}
                placeholder="덮어쓸 대상 선택"
                options={categories.map((category) => ({ value: category.id, label: category.label }))}
                wrapperClassName="flex-1"
                className="rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 focus:border-cyan-500 focus:outline-none"
              />
              {!isSupabaseMode && (
                <button
                  type="button"
                  onClick={() => setIsAddingCategory((prev) => !prev)}
                  title="새 카테고리 추가"
                  className="shrink-0 rounded-md border border-zinc-700 p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <AnimatePresence initial={false}>
              {!isSupabaseMode && isAddingCategory && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={SPRING.collapse}
                  className="overflow-hidden"
                >
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleCreateCategory();
                        }
                      }}
                      placeholder="새 카테고리 이름"
                      className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCreateCategory}
                      className={`shrink-0 ${primaryButtonSm}`}
                    >
                      생성
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
