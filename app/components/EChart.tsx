"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { DataDownloadButton, saveChartImage } from "./DataActions";
import type { ExportSection } from "./DataActions";

type EChartProps = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  onClick?: (params: Record<string, unknown>) => void;
  ariaLabel: string;
  exportTitle?: string;
  exportFileName?: string;
  exportSections?: ExportSection[];
};

export function EChart({
  option,
  className,
  style,
  onClick,
  ariaLabel,
  exportTitle,
  exportFileName,
  exportSections,
}: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);

  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    chart.setOption(option, true);
    const handler = (params: Record<string, unknown>) => clickRef.current?.(params);
    chart.on("click", handler);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.off("click", handler);
      chart.dispose();
      chartRef.current = null;
    };
  }, [option]);

  const canExport = Boolean(exportTitle && exportFileName && exportSections);
  return (
    <div className="chart-block">
      {canExport ? (
        <div className="chart-action-bar" aria-label={`${exportTitle}导出操作`}>
          <button
            type="button"
            className="data-action-button"
            onClick={() => {
              const chart = chartRef.current;
              if (!chart || !exportTitle || !exportFileName) return;
              void saveChartImage({
                dataUrl: chart.getDataURL({ pixelRatio: 2, backgroundColor: "#ffffff" }),
                title: exportTitle,
                fileName: exportFileName,
              });
            }}
          >
            保存图片
          </button>
          <DataDownloadButton fileName={exportFileName || "ccer-chart"} sections={exportSections || []} />
        </div>
      ) : null}
      <div ref={ref} className={className || "chart"} style={style} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export { echarts };
