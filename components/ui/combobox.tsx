"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FLOATING_LIST_CLASSNAME,
  floatingOptionClassName,
  useFloatingList,
  useScrollActiveIntoView,
} from "./floating-list";

interface ComboboxProps {
  /** 추천 목록. 입력한 글자가 들어간 항목만 보여준다. */
  suggestions: string[];
  defaultValue?: string;
  /** <form>의 FormData로 그대로 제출되는 이름. */
  name?: string;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * 직접 입력하거나 추천에서 고를 수 있는 입력칸. 브라우저 기본 <datalist>는 OS 메뉴로
 * 그려져 앱 디자인과 따로 놀기 때문에, 추천 목록을 Select와 같은 떠 있는 목록으로 그린다.
 * 값은 실제 <input>이 갖고 있어서 폼 제출·필수 입력 검사는 기본 입력칸과 똑같이 동작한다.
 */
export function Combobox({
  suggestions,
  defaultValue = "",
  name,
  id,
  required,
  placeholder,
  className = "",
}: ComboboxProps) {
  const [value, setValue] = useState(defaultValue);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const optionId = (index: number) => `${listId}-option-${index}`;

  const query = value.trim().toLowerCase();
  // 입력값과 똑같은 항목 하나만 남으면 더 고를 게 없으므로 목록을 보여주지 않는다.
  const matches = suggestions.filter((item) => item.toLowerCase().includes(query));
  const visible = matches.length === 1 && matches[0].toLowerCase() === query ? [] : matches;
  const showList = isOpen && visible.length > 0;

  const { listRef, motionProps } = useFloatingList({
    isOpen: showList,
    anchorRef: inputRef,
    itemCount: visible.length,
    onClose: () => setIsOpen(false),
  });
  useScrollActiveIntoView(showList, activeIndex >= 0 ? optionId(activeIndex) : null);

  function choose(item: string) {
    setValue(item);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중(예: "인"을 치는 도중)에 누른 Enter·방향키는 글자 조합을 끝내는 용도라 무시한다.
    if (event.nativeEvent.isComposing) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!showList) {
          setIsOpen(true);
          setActiveIndex(0);
        } else {
          setActiveIndex((index) => Math.min(index + 1, visible.length - 1));
        }
        break;
      case "ArrowUp":
        if (!showList) return;
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case "Enter":
        // 추천을 고르는 중일 때만 가로챈다 — 아니면 Enter로 폼을 제출하는 기본 동작을 둔다.
        if (showList && activeIndex >= 0) {
          event.preventDefault();
          choose(visible[activeIndex]);
        }
        break;
      case "Escape":
        // 목록이 열려 있을 때만 목록을 닫고, 서랍·모달은 남긴다(useEscapeKey가 defaultPrevented를 확인한다).
        if (showList) {
          event.preventDefault();
          setIsOpen(false);
        }
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        name={name}
        required={required}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onChange={(event) => {
          setValue(event.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onClick={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        className={className}
      />

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showList && motionProps && (
              <motion.ul ref={listRef} id={listId} role="listbox" {...motionProps} className={FLOATING_LIST_CLASSNAME}>
                {visible.map((item, index) => (
                  <li
                    key={item}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onPointerEnter={() => setActiveIndex(index)}
                    // 누르는 순간 입력칸 포커스가 빠지지 않게 막는다.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => choose(item)}
                    className={floatingOptionClassName(index === activeIndex)}
                  >
                    {item}
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
