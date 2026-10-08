"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import {
  FLOATING_LIST_CLASSNAME,
  floatingOptionClassName,
  useFloatingList,
  useScrollActiveIntoView,
} from "./floating-list";

export interface SelectOption {
  value: string;
  label: ReactNode;
  /** 트리거에 보일 짧은 이름. 없으면 label을 그대로 쓴다. */
  triggerLabel?: ReactNode;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  /** 제어 모드 값. 주지 않으면 defaultValue로 시작하는 비제어 모드. */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** 주면 같은 이름의 숨은 input이 생겨 <form>의 FormData로 그대로 제출된다. */
  name?: string;
  id?: string;
  required?: boolean;
  disabled?: boolean;
  /** 고른 값이 없을 때(빈 값) 트리거에 보일 안내 문구. */
  placeholder?: string;
  /** 트리거 모양(테두리·여백·글자 크기). 화면마다 기존 입력칸과 같은 모양을 넘긴다. */
  className?: string;
  /** 바깥 칸의 배치(예: 가로줄에서 남은 폭을 다 쓰려면 "flex-1"). */
  wrapperClassName?: string;
  title?: string;
  "aria-label"?: string;
}

/**
 * 브라우저 기본 <select> 대신 쓰는 드롭다운. 기본 select는 OS 메뉴로 그려져 앱 디자인과
 * 따로 놀기 때문에, 목록을 직접 그리고 키보드(↑↓·Home/End·Enter·Space·Esc·Tab)도 직접 처리한다.
 * 목록은 body로 포털해 서랍·모달의 overflow에 잘리지 않는다.
 */
export function Select({
  options,
  value,
  defaultValue = "",
  onChange,
  name,
  id,
  required,
  disabled,
  placeholder = "선택",
  className = "",
  wrapperClassName = "",
  title,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [innerValue, setInnerValue] = useState(defaultValue);
  const current = value ?? innerValue;
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const selected = options.find((option) => option.value === current);

  function choose(nextValue: string) {
    if (value === undefined) setInnerValue(nextValue);
    if (nextValue !== current) onChange?.(nextValue);
    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function firstEnabled(from: number, step: 1 | -1) {
    for (let index = from; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) return index;
    }
    return -1;
  }

  function open() {
    if (disabled) return;
    const selectedIndex = options.findIndex((option) => option.value === current && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabled(0, 1));
    setIsOpen(true);
  }

  const { listRef, motionProps } = useFloatingList({
    isOpen,
    anchorRef: triggerRef,
    itemCount: options.length,
    onClose: () => setIsOpen(false),
  });
  useScrollActiveIntoView(isOpen, activeIndex >= 0 ? optionId(activeIndex) : null);

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        const next = firstEnabled(activeIndex + 1, 1);
        if (next >= 0) setActiveIndex(next);
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        const prev = firstEnabled(activeIndex - 1, -1);
        if (prev >= 0) setActiveIndex(prev);
        break;
      }
      case "Home":
        event.preventDefault();
        setActiveIndex(firstEnabled(0, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(firstEnabled(options.length - 1, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (activeIndex >= 0) choose(options[activeIndex].value);
        break;
      case "Escape":
        // 목록만 닫고, 목록을 품은 서랍·모달은 남긴다(useEscapeKey가 defaultPrevented를 확인한다).
        event.preventDefault();
        setIsOpen(false);
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  }

  return (
    <div className={`relative ${wrapperClassName}`}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        aria-label={ariaLabel}
        title={title}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        className={`flex w-full items-center justify-between gap-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
      >
        <span className={`min-w-0 truncate ${selected && current !== "" ? "" : "text-zinc-500"}`}>
          {selected ? selected.triggerLabel ?? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* 폼 제출·필수 입력 검사용. 화면에는 보이지 않고, 비어 있으면 브라우저가 트리거 자리에 안내를 띄운다. */}
      {(name || required) && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          name={name}
          required={required}
          value={current}
          onChange={() => {}}
          onFocus={() => triggerRef.current?.focus()}
          className="pointer-events-none absolute inset-0 opacity-0"
        />
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && motionProps && (
              <motion.ul ref={listRef} id={listId} role="listbox" {...motionProps} className={FLOATING_LIST_CLASSNAME}>
                {options.map((option, index) => {
                  const isSelected = option.value === current;
                  const isActive = index === activeIndex;
                  return (
                    <li
                      key={option.value}
                      id={optionId(index)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={option.disabled || undefined}
                      onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                      onClick={() => !option.disabled && choose(option.value)}
                      className={floatingOptionClassName(isActive, option.disabled)}
                    >
                      <span>{option.label}</span>
                      <Check className={`h-4 w-4 shrink-0 text-cyan-400 ${isSelected ? "" : "invisible"}`} />
                    </li>
                  );
                })}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
