import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "../../ui/primitives";

interface InlineTextProps {
  value: string;
  onSave: (value: string) => void;
  placeholder: string;
  className?: string;
  inputClassName?: string;
  multiline?: boolean;
  startEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  dir?: "auto" | "ltr" | "rtl";
  inputMode?: "text" | "tel" | "email";
  ariaLabel?: string;
}

export function InlineText({ value, onSave, placeholder, className, inputClassName, multiline, startEditing, onEditingChange, dir = "auto", inputMode = "text", ariaLabel }: InlineTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const cancelled = useRef(false);
  const finished = useRef(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (startEditing) begin();
  }, [startEditing]);

  useLayoutEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      ref.current.select?.();
      if (multiline && ref.current instanceof HTMLTextAreaElement) {
        ref.current.style.height = "auto";
        ref.current.style.height = `${ref.current.scrollHeight}px`;
      }
    }
  }, [editing, multiline]);

  function begin(): void {
    cancelled.current = false;
    finished.current = false;
    setDraft(value);
    setEditing(true);
    onEditingChange?.(true);
  }

  function finish(save: boolean): void {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    onEditingChange?.(false);
    const out = multiline ? draft : draft.trim();
    if (save && out !== value) onSave(out);
  }

  if (!editing) {
    return (
      <button type="button" dir={dir} aria-label={value ? `${ariaLabel ?? placeholder}: ${value}` : ariaLabel ?? placeholder} onClick={begin} className={cx("block w-full rounded-lg border border-transparent px-2 py-1 text-start hover:bg-sunk", !value && "text-faint", className)}>
        <span className={multiline ? "whitespace-pre-wrap break-words" : "break-words"}>{value || placeholder}</span>
      </button>
    );
  }

  const shared = {
    value: draft,
    placeholder,
    dir,
    "aria-label": ariaLabel ?? placeholder,
    onBlur: () => {
      if (cancelled.current) return;
      finish(true);
    },
    className: cx("w-full rounded-lg border border-accent bg-card px-2 py-1 outline-none", inputClassName ?? className)
  };

  if (multiline) {
    return (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        rows={2}
        {...shared}
        onChange={(e) => {
          setDraft(e.target.value);
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Escape") {
            cancelled.current = true;
            finish(false);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) finish(true);
        }}
        className={cx(shared.className, "resize-none")}
      />
    );
  }
  return (
    <input
      ref={ref as React.RefObject<HTMLInputElement>}
      inputMode={inputMode}
      {...shared}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (e.key === "Enter") finish(true);
        else if (e.key === "Escape") {
          cancelled.current = true;
          finish(false);
        }
      }}
    />
  );
}
