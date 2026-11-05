"use client";

import { GripVertical } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

const DELETE_W = 80;

/**
 * The rows of a List with `.onMove` and `.onDelete` in a card, always editable: a row is moved by dragging its handle
 * on the right and removed by swiping it to the left, which reveals "Delete". The rows have the same height, which the
 * dragging is based on.
 */
export function ReorderableList({
  items,
  rowHeight,
  renderRow,
  rowClassName,
  onMove,
  onDelete,
}: {
  items: readonly { key: string; label: string }[];
  rowHeight: number;
  /** The content of a row, left of the handle */
  renderRow: (index: number) => ReactNode;
  /** The background of a row, e.g. of a selected one */
  rowClassName?: (index: number) => string;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; dy: number } | null>(null);
  const startY = useRef(0);
  const [swipe, setSwipe] = useState<{ index: number; dx: number; dragging: boolean } | null>(null);
  const swipeStart = useRef<{ x: number; y: number; index: number; base: number; horizontal: boolean | null } | null>(null);
  // a swipe doesn't tap the row
  const swiped = useRef(false);

  if (items.length === 0) return null;

  const target = drag ? Math.min(items.length - 1, Math.max(0, drag.from + Math.round(drag.dy / rowHeight))) : -1;
  // the offset of each row while one is dragged, the others make room like UIKit's live reordering
  const offset = (index: number) => {
    if (!drag) return 0;
    if (index === drag.from) return drag.dy;
    if (drag.from < target && index > drag.from && index <= target) return -rowHeight;
    if (drag.from > target && index < drag.from && index >= target) return rowHeight;
    return 0;
  };
  const swipeOffset = (index: number) => (swipe?.index === index ? swipe.dx : 0);

  return (
    <ul>
      {items.map((item, index) => (
        <li
          key={item.key}
          className={`relative ${drag?.from === index ? "z-10 shadow-lg" : "transition-transform duration-200"}`}
          style={{ height: rowHeight, transform: `translateY(${offset(index)}px)` }}
        >
          {swipe?.index === index && (
            <button
              type="button"
              className="absolute inset-y-0 right-0 flex items-center justify-end bg-[#ff3b30] pr-4 text-body text-white"
              style={{ width: Math.max(DELETE_W, -swipe.dx) }}
              onClick={() => {
                setSwipe(null);
                onDelete(index);
              }}
            >
              Delete
            </button>
          )}
          <div
            className={`relative flex h-full touch-pan-y items-center pl-4 ${rowClassName?.(index) ?? "bg-cell"} ${
              swipe?.dragging ? "" : "transition-transform duration-200"
            }`}
            style={{ transform: `translateX(${swipeOffset(index)}px)` }}
            onPointerDown={(event) => {
              swiped.current = false;
              swipeStart.current = { x: event.clientX, y: event.clientY, index, base: swipeOffset(index), horizontal: null };
              if (swipe && swipe.index !== index) setSwipe(null);
            }}
            onPointerMove={(event) => {
              const start = swipeStart.current;
              if (!start || start.index !== index) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if (start.horizontal === null && Math.hypot(dx, dy) > 8) {
                start.horizontal = Math.abs(dx) > Math.abs(dy);
                if (start.horizontal) event.currentTarget.setPointerCapture(event.pointerId);
              }
              if (start.horizontal) {
                swiped.current = true;
                setSwipe({ index, dx: Math.min(0, start.base + dx), dragging: true });
              }
            }}
            onPointerUp={() => {
              const start = swipeStart.current;
              swipeStart.current = null;
              if (!start?.horizontal || !swipe || swipe.index !== index) {
                // a tap closes an open "Delete"
                if (swipe && !start?.horizontal) {
                  swiped.current = true;
                  setSwipe(null);
                }
                return;
              }
              setSwipe(swipe.dx < -DELETE_W / 2 ? { index, dx: -DELETE_W, dragging: false } : null);
            }}
            onPointerCancel={() => {
              swipeStart.current = null;
              setSwipe(null);
            }}
            onClickCapture={(event) => {
              if (!swiped.current) return;
              swiped.current = false;
              event.stopPropagation();
              event.preventDefault();
            }}
          >
            <div className={`flex h-full min-w-0 flex-1 items-center ${index > 0 ? "border-t border-separator" : ""}`}>
              <div className="min-w-0 flex-1">{renderRow(index)}</div>
              <span
                role="button"
                tabIndex={0}
                aria-label={`Move ${item.label}`}
                className="flex h-full w-12 shrink-0 cursor-grab touch-none items-center justify-center text-tab-inactive active:cursor-grabbing"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startY.current = event.clientY;
                  setDrag({ from: index, dy: 0 });
                }}
                onPointerMove={(event) => drag && setDrag({ ...drag, dy: event.clientY - startY.current })}
                onPointerUp={() => {
                  if (drag && target !== drag.from) onMove(drag.from, target);
                  setDrag(null);
                }}
                onPointerCancel={() => setDrag(null)}
                onKeyDown={(event) => {
                  // the keyboard moves it one row up or down
                  if (event.key === "ArrowUp" && index > 0) onMove(index, index - 1);
                  else if (event.key === "ArrowDown" && index < items.length - 1) onMove(index, index + 1);
                  else return;
                  event.preventDefault();
                }}
              >
                <GripVertical size={20} aria-hidden />
              </span>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
