"use client";

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
  return (
    <details className={`export-menu ${className}`.trim()}>
      <summary aria-label={ariaLabel} title={ariaLabel}>
        <span aria-hidden="true">•••</span>
      </summary>
      <div className="export-menu-popover" role="menu">
        {actions.map((action) => (
          <button
            key={`${action.kind}-${action.label}`}
            type="button"
            role="menuitem"
            disabled={action.disabled}
            onClick={(event) => {
              const details = event.currentTarget.closest("details");
              if (details) details.open = false;
              requestExport({ kind: action.kind, label: action.exportLabel, perform: action.perform });
            }}
          >
            {action.label}
          </button>
        ))}
      </div>
    </details>
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
