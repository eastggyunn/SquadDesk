"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { SPRING } from "@/lib/motion";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const POPOVER_WIDTH = 340;
const GAP = 12;

interface DatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function parseDateString(value?: string): Date | undefined {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function toDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

function getCalendarCells(year: number, month: number) {
  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { date: Date; inCurrentMonth: boolean }[] = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, daysInPrevMonth - i), inCurrentMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ date: new Date(year, month, day), inCurrentMonth: true });
  }
  while (cells.length < 42) {
    const last = cells[cells.length - 1].date;
    cells.push({
      date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1),
      inCurrentMonth: false,
    });
  }

  return cells;
}

export function DatePicker({ value, onChange, placeholder = "날짜 선택" }: DatePickerProps) {
  const selectedDate = parseDateString(value);
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const [coords, setCoords] = useState<{ top: number; left: number; origin: "left" | "right" } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedPopover = popoverRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopover) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault(); // 달력만 닫고, 달력을 품은 서랍·모달은 남긴다(useEscapeKey가 확인한다).
        setIsOpen(false);
      }
    }

    function handleReposition() {
      setIsOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen]);

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const overflowsRight = rect.right + GAP + POPOVER_WIDTH > window.innerWidth;
      const left = overflowsRight ? rect.left - GAP - POPOVER_WIDTH : rect.right + GAP;
      setCoords({ top: rect.top, left, origin: overflowsRight ? "right" : "left" });
    }
    setViewDate(selectedDate ?? new Date());
    setIsOpen(true);
  }

  function handleSelectDay(date: Date) {
    onChange(toDateString(date));
    setIsOpen(false);
  }

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const cells = getCalendarCells(year, month);
  const today = new Date();

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (isOpen ? setIsOpen(false) : openPicker())}
        className="flex w-full items-center rounded-lg border border-zinc-700 bg-zinc-950 py-3 pl-4 pr-11 text-left text-base text-zinc-100 transition-colors hover:border-zinc-600 focus:border-cyan-500 focus:outline-none"
      >
        <span className={selectedDate ? "text-zinc-100" : "text-zinc-600"}>
          {selectedDate
            ? `${selectedDate.getFullYear()}년 ${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`
            : placeholder}
        </span>
      </button>

      <CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-400" />

      {selectedDate && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange("");
          }}
          title="날짜 지우기"
          className="absolute right-11 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isOpen && coords && (
              <motion.div
                ref={popoverRef}
                initial={{ opacity: 0, scale: 0.95, x: coords.origin === "left" ? -6 : 6 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.95, x: coords.origin === "left" ? -6 : 6, transition: SPRING.exit }}
                transition={SPRING.popover}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  transformOrigin: coords.origin === "left" ? "left top" : "right top",
                }}
                className="z-[80] w-[340px] rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
              >
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setViewDate(new Date(year, month - 1, 1))}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-sm font-semibold text-zinc-100">
                    {year}년 {month + 1}월
                  </span>
                  <button
                    type="button"
                    onClick={() => setViewDate(new Date(year, month + 1, 1))}
                    className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100 active:scale-90"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-zinc-500">
                  {WEEKDAYS.map((weekday) => (
                    <span key={weekday} className="py-1">
                      {weekday}
                    </span>
                  ))}
                </div>

                <div className="mt-1 grid grid-cols-7 gap-1">
                  {cells.map(({ date, inCurrentMonth }) => {
                    const isSelected = selectedDate ? isSameDay(date, selectedDate) : false;
                    const isToday = isSameDay(date, today);

                    return (
                      <button
                        key={date.toISOString()}
                        type="button"
                        onClick={() => handleSelectDay(date)}
                        className={`flex aspect-square w-full items-center justify-center rounded-full text-base font-medium transition-colors active:scale-90 ${
                          isSelected
                            ? "bg-cyan-500 text-zinc-950"
                            : inCurrentMonth
                              ? "text-zinc-200 hover:bg-zinc-800"
                              : "text-zinc-700 hover:bg-zinc-800/50"
                        } ${isToday && !isSelected ? "ring-1 ring-inset ring-cyan-500/50" : ""}`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => handleSelectDay(today)}
                  className="mt-3 w-full rounded-md border border-zinc-700 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-800 active:scale-[0.97]"
                >
                  오늘
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
