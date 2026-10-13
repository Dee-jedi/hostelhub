"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/*
 * Custom dropdown that keeps the native <select> API: pass <option>/<optgroup> children,
 * `value`/`defaultValue`, and an `onChange` that reads `e.target.value`. That lets every
 * existing call site use it unchanged while the menu itself is fully styled.
 */

interface Item {
  value: string;
  label: string;
  disabled: boolean;
  group?: string;
}

type OptionProps = { value?: string | number; children?: ReactNode; disabled?: boolean };
type GroupProps = { label?: string; children?: ReactNode };

function textOf(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

function collect(children: ReactNode, group?: string, out: Item[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "option") {
      const p = (child as ReactElement<OptionProps>).props;
      const label = textOf(p.children);
      out.push({ value: p.value !== undefined ? String(p.value) : label, label, disabled: !!p.disabled, group });
    } else if (child.type === "optgroup") {
      const p = (child as ReactElement<GroupProps>).props;
      collect(p.children, p.label, out);
    }
  });
  return out;
}

export interface SelectProps {
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: ReactNode;
  className?: string;
  /** Sizes the control (width etc.); `className` styles the trigger itself. */
  wrapperClassName?: string;
  disabled?: boolean;
  "aria-label"?: string;
  id?: string;
}

const MENU_GAP = 6;
const MENU_MAX = 280;

export function Select({ value, defaultValue, onChange, children, className, wrapperClassName, disabled, id, ...rest }: SelectProps) {
  const items = useMemo(() => collect(children), [children]);
  const [inner, setInner] = useState(defaultValue ?? items[0]?.value ?? "");
  const current = value ?? inner;
  const selected = items.find((i) => i.value === current) ?? items[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typed = useRef({ text: "", at: 0 });
  const listId = useId();

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - MENU_GAP - 8;
    const above = r.top - MENU_GAP - 8;
    const openUp = below < Math.min(MENU_MAX, 200) && above > below;
    setPos({
      left: r.left,
      width: r.width,
      ...(openUp ? { bottom: window.innerHeight - r.top + MENU_GAP } : { top: r.bottom + MENU_GAP }),
      maxHeight: Math.min(MENU_MAX, openUp ? above : below),
    });
  }, []);

  const openMenu = () => {
    if (disabled) return;
    place();
    setActive(Math.max(0, items.findIndex((i) => i.value === selected?.value)));
    setOpen(true);
  };

  const choose = (item: Item) => {
    if (item.disabled) return;
    if (value === undefined) setInner(item.value);
    onChange?.({ target: { value: item.value }, currentTarget: { value: item.value } } as unknown as ChangeEvent<HTMLSelectElement>);
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Keep the menu attached to the trigger while anything scrolls or resizes
  useLayoutEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) menuRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < items.length; i += dir) if (!items[i].disabled) return i;
    return from;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Escape") {
      if (open) {
        e.stopPropagation();
        setOpen(false);
      }
      return;
    }
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
      e.preventDefault();
      openMenu();
      return;
    }
    if (!open) return;
    const moves: Record<string, () => number> = {
      ArrowDown: () => step(active, 1),
      ArrowUp: () => step(active, -1),
      Home: () => step(-1, 1),
      End: () => step(items.length, -1),
    };
    if (moves[e.key]) {
      e.preventDefault();
      setActive(moves[e.key]());
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (items[active]) choose(items[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    } else if (e.key.length === 1) {
      // type-ahead: jump to the first option starting with the typed letters
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : "") + e.key.toLowerCase(), at: now };
      const hit = items.findIndex((i) => !i.disabled && i.label.toLowerCase().startsWith(typed.current.text));
      if (hit >= 0) setActive(hit);
    }
  };

  return (
    <div className={cn("relative", wrapperClassName)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={rest["aria-label"]}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg border border-grey-150 bg-white px-3 py-2 text-left text-sm text-heading-2 outline-none transition-colors",
          "hover:border-grey-400/60 focus-visible:border-brand-500 focus-visible:ring-3 focus-visible:ring-brand-100 disabled:cursor-not-allowed disabled:bg-grey-50",
          open && "border-brand-500 ring-3 ring-brand-100",
          className,
        )}
      >
        {/* Every label sits in the same grid cell so the trigger is as wide as the longest option, like a native select */}
        <span className="grid min-w-0 flex-1">
          {items.map((item, i) => (
            <span
              key={`${item.value}:${i}`}
              aria-hidden={item !== selected}
              className={cn("col-start-1 row-start-1 truncate whitespace-nowrap", item !== selected && "invisible")}
            >
              {item.label}
            </span>
          ))}
          {!selected && <span className="col-start-1 row-start-1 truncate text-grey-400">Select</span>}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-heading-6 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{ left: pos.left, minWidth: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.maxHeight }}
            className="fixed z-[70] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-grey-100 bg-white p-1 shadow-[0_10px_30px_rgba(0,0,0,0.08)] animate-[pop-in_.12s_ease-out] [scrollbar-width:thin]"
          >
            {items.map((item, i) => {
              const header = item.group && item.group !== items[i - 1]?.group;
              const isSelected = item.value === selected?.value;
              return (
                <div key={`${item.group ?? ""}:${item.value}:${i}`}>
                  {header && <p className="px-2.5 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-heading-6 uppercase">{item.group}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={item.disabled}
                    onMouseEnter={() => !item.disabled && setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(item)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm whitespace-nowrap",
                      item.disabled ? "cursor-not-allowed text-grey-400" : isSelected ? "font-medium text-brand-800" : "text-heading-4",
                      !item.disabled && (i === active ? (isSelected ? "bg-brand-50" : "bg-grey-50") : isSelected && "bg-brand-50/60"),
                      item.group && "pl-4",
                    )}
                  >
                    <span className="min-w-0 flex-1">{item.label}</span>
                    {isSelected && <Check className="size-4 shrink-0 text-brand-600" />}
                  </div>
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
