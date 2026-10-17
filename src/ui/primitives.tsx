import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import * as SelectPrimitive from "@radix-ui/react-select";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Check, ChevronDown, ChevronRight, Minus, X } from "lucide-react";
import { translate } from "../app/i18n";
import { useApp } from "../app/store";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";
import { hueOf, initialsOf } from "../core/fold";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "ghost" | "outline" | "danger" | "soft";

const BUTTON_BASE = "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[color,background-color,border-color,filter,transform] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none select-none whitespace-nowrap";
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white hover:brightness-105 active:brightness-95",
  ghost: "text-ink2 hover:bg-sunk",
  outline: "border border-line bg-card text-ink hover:bg-sunk",
  danger: "btn-danger bg-danger hover:brightness-105",
  soft: "bg-accent-soft text-accent-strong hover:brightness-95"
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}

const BUTTON_SIZES = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm", lg: "h-11 px-5 text-sm" };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "outline", size = "md", className, type = "button", ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)} {...rest} />;
});

export function LinkButton({ href, variant = "outline", size = "md", className, disabledReason, onClick, children }: { href: string | null; variant?: ButtonVariant; size?: "sm" | "md" | "lg"; className?: string; disabledReason: string; onClick?: () => void; children: ReactNode }) {
  const classes = cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className);
  if (!href) {
    return (
      <span title={disabledReason} className="inline-flex">
        <span role="link" aria-disabled="true" className={cx(classes, "pointer-events-none opacity-40")}>
          {children}
        </span>
      </span>
    );
  }
  const external = href.startsWith("http");
  return (
    <a href={href} onClick={onClick} className={classes} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
      {children}
    </a>
  );
}

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }>(function IconButton({ active, label, className, type = "button", ...rest }, ref) {
  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>
        <button ref={ref} type={type} aria-label={label} className={cx("inline-grid size-8 place-items-center rounded-lg text-muted transition-[color,background-color,transform] duration-150 hover:bg-sunk hover:text-ink active:scale-90 disabled:opacity-40", active && "text-accent", className)} {...rest} />
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-[100] rounded-md bg-ink px-2 py-1 text-xs font-medium text-paper anim-fade">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
});

export const TooltipProvider = TooltipPrimitive.Provider;

export function Avatar({ name, size = 40, seed }: { name: string; size?: number; seed?: string }) {
  const hue = hueOf(seed ?? name);
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold select-none"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 45% 28%)` }}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  );
}

export function Checkbox({ checked, onCheckedChange, onClick, label, className, tabIndex }: { checked: boolean | "indeterminate"; tabIndex?: number; onCheckedChange?: (v: boolean) => void; onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void; label: string; className?: string }) {
  return (
    <CheckboxPrimitive.Root
      checked={checked}
      onCheckedChange={(v) => onCheckedChange?.(v === true)}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      aria-label={label}
      tabIndex={tabIndex}
      className={cx("relative grid size-[18px] shrink-0 place-items-center rounded-md border border-faint bg-card before:absolute before:-inset-[11px] before:content-[''] data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent", className)}
    >
      <CheckboxPrimitive.Indicator className="text-white">
        {checked === "indeterminate" ? <Minus size={12} strokeWidth={3} /> : <Check size={12} strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export function Switch({ checked, onCheckedChange, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string }) {
  return (
    <SwitchPrimitive.Root checked={checked} onCheckedChange={onCheckedChange} aria-label={label} className="relative h-6 w-10 shrink-0 rounded-full bg-line transition-colors data-[state=checked]:bg-accent">
      <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[18px] rtl:-translate-x-0.5 rtl:data-[state=checked]:-translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode; title?: string }> }) {
  return (
    <div role="tablist" className="inline-flex rounded-xl bg-sunk p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("inline-flex h-7 items-center gap-1.5 rounded-[10px] px-2.5 text-xs font-semibold transition-colors", value === o.value ? "bg-card text-ink shadow-sm" : "text-muted hover:text-ink")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onOpenChange, title, description, children, size = "md", footer, fullScreen }: { open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: string; children: ReactNode; size?: "sm" | "md" | "lg" | "xl"; footer?: ReactNode; fullScreen?: boolean }) {
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-6xl" };
  const lang = useApp((s) => s.lang);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] anim-fade" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cx(
            "fixed z-50 flex flex-col overflow-hidden bg-card shadow-[var(--shadow)] anim-pop focus:outline-none",
            fullScreen ? "inset-0" : cx("start-1/2 top-1/2 max-h-[90dvh] w-[calc(100%-24px)] -translate-y-1/2 rounded-2xl border border-line ltr:-translate-x-1/2 rtl:translate-x-1/2", widths[size])
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="serif truncate text-2xl leading-tight">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="text-xs text-muted">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunk" aria-label={translate(lang, "close")}>
              <X size={16} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="scroll-thin min-h-0 flex-1 overflow-auto">{children}</div>
          {footer ? <div className="flex items-center justify-end gap-2 border-t border-line bg-card px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const MENU_CONTENT = "z-[90] min-w-[200px] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-[var(--shadow)] anim-pop";
const MENU_ITEM = "flex cursor-default select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-sunk data-[disabled]:opacity-40 data-[disabled]:pointer-events-none";

export interface MenuEntry {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  children?: MenuEntry[];
}

function renderEntries(entries: MenuEntry[], kind: "dropdown" | "context"): ReactNode {
  const P = kind === "dropdown" ? DropdownPrimitive : ContextMenuPrimitive;
  return entries.map((entry) => {
    if (entry.separator) return <P.Separator key={entry.key} className="my-1 h-px bg-line" />;
    if (entry.children) {
      return (
        <P.Sub key={entry.key}>
          <P.SubTrigger className={MENU_ITEM}>
            {entry.icon}
            <span className="flex-1">{entry.label}</span>
            <ChevronRight size={14} className="text-muted rtl:rotate-180" />
          </P.SubTrigger>
          <P.Portal>
            <P.SubContent className={MENU_CONTENT} sideOffset={6}>
              {renderEntries(entry.children, kind)}
            </P.SubContent>
          </P.Portal>
        </P.Sub>
      );
    }
    if (entry.href && !entry.disabled) {
      const external = entry.href.startsWith("http");
      return (
        <P.Item key={entry.key} asChild className={cx(MENU_ITEM, entry.danger && "text-danger")}>
          <a href={entry.href} target={external ? "_blank" : undefined} rel="noopener noreferrer">
            {entry.icon}
            <span className="flex-1">{entry.label}</span>
          </a>
        </P.Item>
      );
    }
    return (
      <P.Item key={entry.key} disabled={entry.disabled} onSelect={() => entry.onSelect?.()} className={cx(MENU_ITEM, entry.danger && "text-danger")}>
        {entry.icon}
        <span className="flex-1">{entry.label}</span>
      </P.Item>
    );
  });
}

export function DropdownMenu({ trigger, entries, align = "end" }: { trigger: ReactNode; entries: MenuEntry[]; align?: "start" | "end" }) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content align={align} sideOffset={6} className={MENU_CONTENT}>
          {renderEntries(entries, "dropdown")}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function ContextMenu({ children, entries, onOpenChange }: { children: ReactNode; entries: () => MenuEntry[]; onOpenChange?: (open: boolean) => void }) {
  return (
    <ContextMenuPrimitive.Root onOpenChange={onOpenChange}>
      <ContextMenuPrimitive.Trigger asChild>{children}</ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content className={MENU_CONTENT}>{renderEntries(entries(), "context")}</ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  );
}

export function Select<T extends string>({ value, onValueChange, options, label, className }: { value: T; onValueChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string; className?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <SelectPrimitive.Trigger aria-label={label} className={cx("inline-flex h-9 items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 text-sm hover:bg-sunk", className)}>
        <SelectPrimitive.Value />
        <SelectPrimitive.Icon>
          <ChevronDown size={14} className="text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className={cx(MENU_CONTENT, "z-[120] max-h-72 min-w-[var(--radix-select-trigger-width)]")}>
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className={cx(MENU_ITEM, "justify-between")}>
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check size={14} />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export function PopoverContent({ children, className, align = "start" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={6} className={cx("z-[110] rounded-xl border border-line bg-card p-3 shadow-[var(--shadow)] anim-pop", className)}>
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabList({ children }: { children: ReactNode }) {
  return <TabsPrimitive.List className="flex gap-1 overflow-x-auto border-b border-line px-3 scroll-thin">{children}</TabsPrimitive.List>;
}
export function Tab({ value, children, badge }: { value: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <TabsPrimitive.Trigger value={value} className="relative inline-flex h-10 items-center gap-2 whitespace-nowrap px-3 text-sm font-semibold text-muted data-[state=active]:text-ink data-[state=active]:after:absolute data-[state=active]:after:inset-x-2 data-[state=active]:after:bottom-0 data-[state=active]:after:h-0.5 data-[state=active]:after:rounded-full data-[state=active]:after:bg-accent">
      {children}
      {badge}
    </TabsPrimitive.Trigger>
  );
}
export const TabPanel = TabsPrimitive.Content;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-ink2">
      {label}
      {children}
      {hint ? <span className="font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass = "h-9 w-full rounded-xl border border-line bg-card px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" | "good" | "danger" }) {
  const tones = { neutral: "bg-sunk text-ink2", accent: "bg-accent-soft text-accent-strong", good: "bg-good-soft text-good-strong", danger: "bg-danger/15 text-danger" };
  return <span className={cx("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-5", tones[tone])}>{children}</span>;
}

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  const text = label ?? translate(useApp.getState().lang, "loading");
  return <span className="inline-block animate-spin rounded-full border-2 border-line border-t-accent" style={{ width: size, height: size }} role="status" aria-label={text} />;
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunk" role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }} />
    </div>
  );
}
