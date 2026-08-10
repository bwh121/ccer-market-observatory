"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useExportAccess } from "./ExportAccess";

export type ExportCell = string | number | boolean | null | undefined;
export type ExportRow = Record<string, ExportCell>;
export type ExportSection = {
  title: string;
  rows: ExportRow[];
};

const safeFileName = (value: string) =>
  value.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-") || "ccer-data";

const csvCell = (value: ExportCell) => {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const triggerDownload = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export function downloadDataSections(fileName: string, sections: ExportSection[]) {
  const lines: string[] = [];
  for (const section of sections) {
    const columns = [...new Set(section.rows.flatMap((row) => Object.keys(row)))];
    lines.push(csvCell(section.title));
    if (!section.rows.length) {
      lines.push("无数据", "");
      continue;
    }
    lines.push(columns.map(csvCell).join(","));
    for (const row of section.rows) {
      lines.push(columns.map((column) => csvCell(row[column])).join(","));
    }
    lines.push("");
  }
  triggerDownload(
    new Blob([`\uFEFF${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" }),
    `${safeFileName(fileName)}.csv`,
  );
}

export type ExportMenuAction = {
  kind: "image" | "data";
  label: string;
  exportLabel: string;
  perform: () => void | Promise<void>;
  disabled?: boolean;
};

export function ExportActionMenu({
  actions,
  ariaLabel = "导出操作",
  className = "",
}: {
  actions: ExportMenuAction[];
  ariaLabel?: string;
  className?: string;
}) {
  const { requestExport } = useExportAccess();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const cancelScheduledClose = () => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  };

  const scheduleClose = () => {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 160);
  };

  const toggleMenu = () => {
    cancelScheduledClose();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const menuWidth = 152;
    const menuHeight = actions.length * 40 + 8;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const below = rect.bottom + 6;
    const top = below + menuHeight <= window.innerHeight - 8
      ? below
      : Math.max(8, rect.top - menuHeight - 6);
    setPosition({ top, left });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => () => cancelScheduledClose(), []);

  return (
    <div
      className={`export-menu ${className}`.trim()}
      onMouseEnter={cancelScheduledClose}
      onMouseLeave={scheduleClose}
    >
      <button
        ref={triggerRef}
        type="button"
        className="export-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={ariaLabel}
        onClick={toggleMenu}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={popoverRef}
          className="export-menu-popover"
          role="menu"
          style={{ top: position.top, left: position.left }}
          onMouseEnter={cancelScheduledClose}
          onMouseLeave={() => setOpen(false)}
        >
          {actions.map((action) => (
            <button
              key={`${action.kind}-${action.label}`}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                requestExport({ kind: action.kind, label: action.exportLabel, perform: action.perform });
              }}
            >
              {action.label}
            </button>
          ))}
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function DataDownloadMenu({
  fileName,
  sections,
}: {
  fileName: string;
  sections: ExportSection[];
}) {
  const hasRows = sections.some((section) => section.rows.length);
  return (
    <ExportActionMenu
      ariaLabel="表格导出操作"
      actions={[{
        kind: "data",
        label: "下载数据",
        exportLabel: fileName,
        perform: () => downloadDataSections(fileName, sections),
        disabled: !hasRows,
      }]}
    />
  );
}

export async function saveChartImage({
  dataUrl,
  title,
  fileName,
}: {
  dataUrl: string;
  title: string;
  fileName: string;
}) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();

  const topBand = 104;
  const bottomBand = 68;
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight + topBand + bottomBand;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#14211f";
  context.font = '600 30px "Noto Serif SC", "Source Han Serif SC", serif';
  context.textBaseline = "middle";
  context.fillText(title, 38, topBand / 2, canvas.width - 76);
  context.drawImage(image, 0, topBand);
  context.fillStyle = "#7a8986";
  context.font = '20px "Noto Sans SC", "Microsoft YaHei", sans-serif';
  context.fillText(
    "来源：全国 CCER 市场信息追踪 · 作者：逃跑大魔王",
    38,
    canvas.height - bottomBand / 2,
    canvas.width - 76,
  );

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (blob) triggerDownload(blob, `${safeFileName(fileName)}.png`);
}
