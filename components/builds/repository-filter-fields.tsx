"use client";

import { useId } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { BuildSourceSetting } from "@/lib/supabase/schema";
import type { RepositoryWorkflow } from "@/lib/github/connect-actions";
import { Select } from "@/components/ui/select";
import { SegmentedIndicator } from "@/components/ui/segmented-indicator";
import { segmentedGroup, segmentedItem } from "@/components/ui/button-styles";
import { SPRING } from "@/lib/motion";

export const ALL_WORKFLOWS = "";

const SOURCE_OPTIONS: { value: BuildSourceSetting; label: string }[] = [
  { value: "artifact", label: "Actions artifact" },
  { value: "release", label: "Release" },
  { value: "both", label: "둘 다" },
];

const INPUT_CLASS =
  "mt-1.5 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-cyan-500 focus:outline-none";

export interface RepositoryFilterValues {
  buildSource: BuildSourceSetting;
  /** ALL_WORKFLOWS("")면 전체 워크플로. */
  workflowPath: string;
  /** 빈 문자열이면 전체 브랜치. */
  branch: string;
}

interface RepositoryFilterFieldsProps {
  values: RepositoryFilterValues;
  onChange: (values: RepositoryFilterValues) => void;
  /**
   * 저장소의 워크플로 목록. null이면 불러오는 중. "unavailable"이면 목록을 읽을 권한이 없는 경우라
   * (그 GitHub 계정을 직접 연결하지 않은 owner 등) 경로를 직접 입력받는다.
   */
  workflows: RepositoryWorkflow[] | null | "unavailable";
}

/** 받을 빌드 종류 + (artifact일 때) 워크플로·브랜치. 저장소 연결 모달과 설정 모달이 같이 쓴다. */
export function RepositoryFilterFields({ values, onChange, workflows }: RepositoryFilterFieldsProps) {
  const indicatorId = useId();
  const branchId = useId();
  const usesArtifacts = values.buildSource !== "release";
  // 목록이 오기 전(또는 저장된 워크플로가 목록에서 사라진 경우)에도 지금 값을 파일 이름으로 바로 보여준다 —
  // 칸을 비활성으로 두고 GitHub 응답을 기다리게 하지 않는다. 목록이 오면 워크플로 이름으로 바뀐다.
  const workflowOptions = workflows === "unavailable" ? [] : (workflows ?? []);
  const savedWorkflowMissing =
    values.workflowPath !== ALL_WORKFLOWS && !workflowOptions.some((workflow) => workflow.path === values.workflowPath);
  const selectableWorkflows = savedWorkflowMissing
    ? [
        ...workflowOptions,
        { path: values.workflowPath, name: values.workflowPath.split("/").pop() ?? values.workflowPath },
      ]
    : workflowOptions;

  return (
    <>
      <div>
        <span className="block text-xs font-medium text-zinc-400">받을 빌드</span>
        <div className={`${segmentedGroup} mt-1.5`}>
          {SOURCE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange({ ...values, buildSource: option.value })}
              className={`relative ${segmentedItem} border-transparent ${
                values.buildSource === option.value ? "text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {values.buildSource === option.value && <SegmentedIndicator layoutId={indicatorId} />}
              <span className="relative">{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {usesArtifacts && (
          <motion.div
            key="artifact-filters"
            // 높이 0이어도 부모 flex gap(16px)이 남으므로 marginTop -16으로 같이 접는다.
            initial={{ height: 0, opacity: 0, marginTop: -16 }}
            animate={{ height: "auto", opacity: 1, marginTop: 0 }}
            exit={{ height: 0, opacity: 0, marginTop: -16 }}
            transition={SPRING.collapse}
            className="overflow-hidden"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="block text-xs font-medium text-zinc-400">워크플로</span>
                {workflows === "unavailable" ? (
                  <input
                    aria-label="워크플로 파일 경로"
                    value={values.workflowPath}
                    onChange={(event) => onChange({ ...values, workflowPath: event.target.value })}
                    placeholder=".github/workflows/main.yml (비우면 전체)"
                    className={INPUT_CLASS}
                  />
                ) : (
                  <Select
                    aria-label="워크플로"
                    value={values.workflowPath}
                    onChange={(workflowPath) => onChange({ ...values, workflowPath })}
                    options={[
                      { value: ALL_WORKFLOWS, label: "전체 워크플로" },
                      ...selectableWorkflows.map((workflow) => ({
                        value: workflow.path,
                        label: workflow.name,
                        triggerLabel: workflow.name,
                      })),
                    ]}
                    wrapperClassName="mt-1.5"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                  />
                )}
              </div>
              <div>
                <label htmlFor={branchId} className="block text-xs font-medium text-zinc-400">
                  브랜치 <span className="text-zinc-600">(비우면 전체)</span>
                </label>
                <input
                  id={branchId}
                  value={values.branch}
                  onChange={(event) => onChange({ ...values, branch: event.target.value })}
                  placeholder="전체 브랜치"
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <p className="text-[11px] leading-relaxed text-zinc-600">
        {usesArtifacts
          ? "조건에 맞는 워크플로가 성공하면 빌드가 자동으로 올라옵니다. 실패한 실행은 가져오지 않습니다."
          : "Release를 게시하면 첨부 파일이 빌드로 올라옵니다."}
      </p>
    </>
  );
}
