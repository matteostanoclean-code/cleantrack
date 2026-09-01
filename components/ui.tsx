"use client";

/**
 * Gemeinsame Bausteine für alle Schichtklar-Bildschirme.
 *
 * Stil-Vorbild: sachliche, ruhige Listen- und Detailansichten.
 * Regeln, damit alles gleich wirkt:
 *  - Weißer Inhalt auf hellgrauem Seitenhintergrund
 *  - Detailangaben als Zeile: graues Icon, kleines Label, kräftiger Wert, Haarlinie darunter
 *  - Farbe nur dort, wo sie eine Bedeutung hat (rot = Problem/Ablehnen, grün = erledigt/Freigeben)
 */

import React from "react";

export function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ Icons */

const ICON_PATHS: Record<string, string> = {
  pin: "M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  calendar: "M7 2v3M17 2v3M3.5 9h17M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3.5 2",
  target: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  stopwatch: "M9 2h6M12 5v0a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4.5V13l3 2M18.5 5.5l1.5 1.5",
  warning: "M12 9v4.5M12 17h.01M10.3 3.9 2.5 17.4A2 2 0 0 0 4.2 20.4h15.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z",
  login: "M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3",
  logout: "M9 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M16 17l5-5-5-5M21 12H9",
  coffee: "M4 8h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Zm12 1h2.5a2.5 2.5 0 0 1 0 5H16M6 2.5v2M10 2.5v2M14 2.5v2",
  car: "M5 16.5h14M6.5 16.5V19a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2.5M20.5 16.5V19a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1v-2.5M3.5 16.5v-4l1.8-4.6A2 2 0 0 1 7.2 6.6h9.6a2 2 0 0 1 1.9 1.3l1.8 4.6v4M7 13h.01M17 13h.01",
  euro: "M17 6.5A6.5 6.5 0 0 0 7.2 12a6.5 6.5 0 0 0 9.8 5.5M4.5 10.5h7M4.5 13.5h7",
  user: "M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  users: "M16 21v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V21M9 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM22 21v-1.5a4 4 0 0 0-3-3.87M16 4.13a4 4 0 0 1 0 7.75",
  building: "M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M3 21h18M8 7h2M8 11h2M8 15h2M14 9h3M14 13h3M14 17h3",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  filter: "M4 5h16M7 12h10M10 19h4",
  check: "m5 13 4 4L19 7",
  close: "M6 6l12 12M18 6 6 18",
  chevronRight: "m9 5 7 7-7 7",
  chevronLeft: "m15 5-7 7 7 7",
  chevronDown: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  pencil: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z",
  note: "M6 3h9l3 3v15H6V3Zm8 0v4h4M8.5 11h7M8.5 15h7M8.5 19h4",
  box: "M4 7l8-4 8 4-8 4-8-4Zm0 0v10l8 4 8-4V7M12 11v10",
  photo: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 11 5-5 4 4 3-3 5 5M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  chat: "M21 12a8 8 0 0 1-8 8H6l-3 3v-6.5A8 8 0 1 1 21 12Z",
  refresh: "M20 11a8 8 0 1 0-.6 4M20 5v6h-6",
  flag: "M5 21V4m0 0 5.5 1.5L16 4l3 1v9l-3-1-5.5 1.5L5 13",
  priority: "M6 20v-5M12 20V9M18 20V4",
  bell: "M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0a3 3 0 0 1-6 0",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  plane: "M17.8 19.8 16 14l-4 1.5V21l-2 1 .5-4.5-3-1L6 19l-2-1 1.5-3-1-3L2 13l-1-2 4.5-.5L7 7l-3-1 1-2 3 1.5 3-1L14 2l1 2-1.5 4L20 6l2 1-4 3.5.5 4.5Z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.5a7.6 7.6 0 0 0 0-2l2-1.5-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14.9 3H9.1l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.6h5.8l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5Z",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-2.2-12a2.2 2.2 0 1 1 3 2.1c-.5.2-.8.7-.8 1.2v.7M12 17.5h.01",
  invoice: "M7 3h10a1 1 0 0 1 1 1v17l-2.5-1.5L13 21l-2.5-1.5L8 21l-2.5-1.5V4a1 1 0 0 1 1-1Zm2 5h6M9 12h6M9 16h3",
  key: "M14 8.5a4.5 4.5 0 1 1-3.2 7.7L9 18H7v2H5v2H2v-3l6.3-6.3A4.5 4.5 0 0 1 14 8.5Zm1.5 3h.01",
  grid: "M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"
};

export function UiIcon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] || ICON_PATHS.list} />
    </svg>
  );
}

/* ------------------------------------------------------------ Seitenrahmen */

/**
 * Seitenkopf.
 *
 * Am Handy die schmale Leiste mit Zurück-Pfeil und mittigem Titel. Am Rechner
 * eine Überschrift links, ohne Pfeil — dort führt die Seitenleiste zurück.
 */
export function PageHeader({ title, onBack, backHref, right }: { title: string; onBack?: () => void; backHref?: string; right?: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-paper-200 bg-white px-2 py-3 md:hidden" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        {onBack ? (
          <button onClick={onBack} className="grid h-10 w-10 place-items-center rounded-full text-ink-800" aria-label="Zurück">
            <UiIcon name="chevronLeft" className="h-6 w-6" />
          </button>
        ) : backHref ? (
          <a href={backHref} className="grid h-10 w-10 place-items-center rounded-full text-ink-800" aria-label="Zurück">
            <UiIcon name="chevronLeft" className="h-6 w-6" />
          </a>
        ) : (
          <span className="h-10 w-10" />
        )}
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-ink-900">{title}</h1>
        <div className="flex h-10 min-w-10 items-center justify-end pr-1">{right}</div>
      </header>

      <div className="hidden items-start justify-between gap-4 pb-4 md:flex">
        <div>
          <h1 className="text-[26px] font-bold text-ink-900">{title}</h1>
        </div>
        <div className="flex items-center gap-2">{right}</div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------- Tabs */

export function SegmentedTabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ key: T; label: string }>; value: T; onChange: (key: T) => void }) {
  return (
    <div className="flex gap-6 border-b border-paper-200 px-4">
      {tabs.map((tab) => {
        const active = tab.key === value;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cx("relative -mb-px pb-3 pt-2 text-[15px] transition", active ? "font-semibold text-ink-900" : "text-ink-400")}
          >
            {tab.label}
            {active ? <span className="absolute inset-x-0 -bottom-px h-[3px] rounded-full bg-brand-600" /> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

export function Chip({ label, active, icon, count, onClick }: { label: string; active?: boolean; icon?: string; count?: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[13px] transition",
        active ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-paper-300 bg-white text-ink-600"
      )}
    >
      {icon ? <UiIcon name={icon} className="h-4 w-4" /> : null}
      {label}
      {typeof count === "number" && count > 0 ? (
        <span className={cx("rounded-full px-1.5 text-[11px] font-bold", active ? "bg-white/25 text-white" : "bg-paper-200 text-ink-600")}>{count}</span>
      ) : null}
    </button>
  );
}

export function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">{children}</div>;
}

/* ---------------------------------------------------------------- Status */

export type Tone = "pending" | "success" | "danger" | "neutral" | "info" | "warn";

const TONE_CLASS: Record<Tone, string> = {
  pending: "bg-danger-500 text-white",
  success: "bg-success-100 text-success-700",
  danger: "bg-danger-100 text-danger-700",
  neutral: "bg-paper-200 text-ink-600",
  info: "bg-brand-100 text-brand-700",
  warn: "bg-amber-100 text-amber-700"
};

export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx("shrink-0 rounded-md px-2.5 py-1 text-[12px] font-semibold", TONE_CLASS[tone])}>{children}</span>;
}

/* -------------------------------------------------------- Detail-Bausteine */

export function SectionHeading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-4 pb-2 pt-5">
      <h2 className="text-[17px] font-bold text-ink-900">{children}</h2>
      {right}
    </div>
  );
}

/** Detailzeile: Icon, Label, Wert. Haarlinie trennt die Zeilen, wie in der Vorlage. */
export function DetailRow({ icon, label, value, hint, tone, onClick }: { icon?: string; label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "danger"; onClick?: () => void }) {
  const content = (
    <>
      {icon ? (
        <span className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-danger-500" : "text-ink-400")}>
          <UiIcon name={icon} className="h-[22px] w-[22px]" />
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink-400">{label}</span>
        <span className={cx("mt-0.5 block text-[16px] font-semibold", tone === "danger" ? "text-danger-600" : "text-ink-900")}>{value}</span>
        {hint ? <span className="mt-1 block text-[13px] text-ink-400">{hint}</span> : null}
      </span>
      {onClick ? <UiIcon name="chevronRight" className="mt-2 h-4 w-4 shrink-0 text-ink-200" /> : null}
    </>
  );

  const className = "flex w-full items-start gap-3 border-b border-paper-200 px-4 py-3.5 text-left last:border-b-0";
  if (onClick) return <button type="button" onClick={onClick} className={className}>{content}</button>;
  return <div className={className}>{content}</div>;
}

/** Kleine Kachel für Werte, die nebeneinander stehen (Von/Bis, Pause/Fahrzeit). */
export function ValueTile({ icon, label, value, onClick }: { icon?: string; label: string; value: React.ReactNode; onClick?: () => void }) {
  const inner = (
    <>
      <div className="flex items-center gap-2 text-ink-400">
        {icon ? <UiIcon name={icon} className="h-[18px] w-[18px]" /> : null}
        <span className="text-[13px]">{label}</span>
      </div>
      <p className="mt-1.5 text-[17px] font-semibold text-ink-900">{value}</p>
    </>
  );
  const className = "rounded-xl border border-paper-200 px-3.5 py-3 text-left";
  if (onClick) return <button type="button" onClick={onClick} className={cx(className, "w-full")}>{inner}</button>;
  return <div className={className}>{inner}</div>;
}

/** Eingabefeld im Kachel-Look, für Korrekturen vor der Freigabe. */
export function TileInput({ icon, label, value, onChange, type = "text", inputMode, placeholder, suffix }: { icon?: string; label: string; value: string; onChange: (next: string) => void; type?: string; inputMode?: "numeric" | "text"; placeholder?: string; suffix?: string }) {
  return (
    <label className="block rounded-xl border border-paper-200 px-3.5 py-3">
      <span className="flex items-center gap-2 text-[13px] text-ink-400">
        {icon ? <UiIcon name={icon} className="h-[18px] w-[18px]" /> : null}
        {label}
      </span>
      <span className="mt-1 flex items-baseline gap-1">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="w-full min-w-0 border-0 bg-transparent p-0 text-[17px] font-semibold text-ink-900 outline-none placeholder:font-normal placeholder:text-ink-200"
        />
        {suffix ? <span className="shrink-0 text-[13px] text-ink-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

/* -------------------------------------------------------------- Suchfeld */

export function SearchInput({ value, onChange, placeholder = "Suche" }: { value: string; onChange: (next: string) => void; placeholder?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-paper-200 bg-white px-4 py-3">
      <UiIcon name="search" className="h-5 w-5 shrink-0 text-ink-400" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full border-0 bg-transparent p-0 text-[15px] text-ink-900 outline-none placeholder:text-ink-200"
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="shrink-0 text-ink-400" aria-label="Suche leeren">
          <UiIcon name="close" className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ Bottom-Sheet */

/**
 * Detail-Sheet von unten: Griff, Titel mit Status, optionale Tabs, scrollender
 * Inhalt und fest stehende Aktionsleiste am Fuß.
 */
export function DetailSheet({ title, subtitle, status, tabs, children, footer, onClose }: {
  title: string;
  subtitle?: React.ReactNode;
  status?: React.ReactNode;
  tabs?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40" onClick={onClose}>
      <div
        className="flex max-h-[94dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-10 rounded-full bg-paper-300" />
        </div>
        <div className="flex items-start gap-3 px-4 pb-3 pt-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[22px] font-bold text-ink-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-[14px] text-ink-400">{subtitle}</p> : null}
          </div>
          {status}
        </div>
        {tabs}
        <div className="min-h-0 flex-1 overflow-y-auto pb-4">{children}</div>
        {footer ? (
          <div className="border-t border-paper-200 bg-white p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Eingabe-Sheet: gleicher Rahmen, aber mit Schließen-Pfeil und mittigem Titel. */
export function FormSheet({ title, children, footer, onClose }: { title: string; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40" onClick={onClose}>
      <div className="flex max-h-[94dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-2xl bg-white" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="relative flex items-center justify-center border-b border-paper-200 px-4 py-3.5">
          <button onClick={onClose} className="absolute left-3 text-ink-600" aria-label="Schließen">
            <UiIcon name="chevronDown" className="h-6 w-6" />
          </button>
          <h2 className="text-[17px] font-bold text-ink-900">{title}</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer ? (
          <div className="border-t border-paper-200 bg-white p-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- Aktionen */

export function ActionBar({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

const BUTTON_VARIANT: Record<string, string> = {
  primary: "bg-brand-600 text-white",
  danger: "bg-danger-500 text-white",
  success: "bg-success-500 text-white",
  neutral: "bg-paper-100 text-ink-800 border border-paper-300",
  ghost: "text-brand-700"
};

export function Button({ variant = "primary", full, disabled, onClick, type = "button", form, children }: {
  variant?: "primary" | "danger" | "success" | "neutral" | "ghost";
  full?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  form?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type={type}
      form={form}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "rounded-xl px-4 py-3.5 text-[16px] font-semibold transition disabled:opacity-50",
        BUTTON_VARIANT[variant],
        full && "w-full"
      )}
    >
      {children}
    </button>
  );
}

export function Stepper({ value, onChange, min = 0, max = 999 }: { value: number; onChange: (next: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-xl border border-paper-200 px-1 py-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="grid h-8 w-8 place-items-center rounded-lg text-ink-600 disabled:text-ink-200"
        aria-label="Weniger"
      >
        <UiIcon name="minus" className="h-4 w-4" />
      </button>
      <span className="w-7 text-center text-[16px] font-semibold text-ink-900">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="grid h-8 w-8 place-items-center rounded-lg text-brand-600 disabled:text-ink-200"
        aria-label="Mehr"
      >
        <UiIcon name="plus" className="h-4 w-4" />
      </button>
    </div>
  );
}

/* --------------------------------------------------------------- Zustände */

export function EmptyState({ title, text, icon = "list" }: { title: string; text?: string; icon?: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-paper-100 text-ink-200">
        <UiIcon name={icon} className="h-6 w-6" />
      </div>
      <p className="mt-4 text-[16px] font-semibold text-ink-900">{title}</p>
      {text ? <p className="mx-auto mt-1 max-w-[36ch] text-[14px] text-ink-400">{text}</p> : null}
    </div>
  );
}

export function Banner({ tone = "info", children }: { tone?: "info" | "danger" | "success" | "warn"; children: React.ReactNode }) {
  const classes: Record<string, string> = {
    info: "bg-brand-50 text-brand-700",
    danger: "bg-danger-50 text-danger-700",
    success: "bg-success-50 text-success-700",
    warn: "bg-amber-100 text-amber-700"
  };
  return <div className={cx("rounded-xl px-4 py-3 text-[14px]", classes[tone])}>{children}</div>;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center gap-3 py-16">
      <span className="h-8 w-8 animate-spin rounded-full border-[3px] border-paper-200 border-t-brand-600" />
      {label ? <p className="text-[14px] text-ink-400">{label}</p> : null}
    </div>
  );
}
