"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { ExportActionMenu, prepareChartImage, prepareDataSections } from "./DataActions";
import type { ExportSection } from "./DataActions";

type EChartProps = {
  option: EChartsOption;
  group?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: (params: Record<string, unknown>) => void;
  onPlotAreaClick?: (position: { offsetX: number; offsetY: number }, chart: echarts.ECharts) => void;
  ariaLabel: string;
  exportTitle?: string;
  exportFileName?: string;
  exportSections?: ExportSection[];
};

export function EChart({
  option,
  group,
  className,
  style,
  onClick,
  onPlotAreaClick,
  ariaLabel,
  exportTitle,
  exportFileName,
  exportSections,
}: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const clickRef = useRef(onClick);
  const plotAreaClickRef = useRef(onPlotAreaClick);

  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    plotAreaClickRef.current = onPlotAreaClick;
  }, [onPlotAreaClick]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    if (group) {
      chart.group = group;
      echarts.connect(group);
    }
    chartRef.current = chart;
    chart.setOption(option, true);
    const handler = (params: Record<string, unknown>) => clickRef.current?.(params);
    const plotHandler = (event: { target?: unknown; offsetX?: number; offsetY?: number }) => {
      if (event.target || !Number.isFinite(event.offsetX) || !Number.isFinite(event.offsetY)) return;
      plotAreaClickRef.current?.(
        { offsetX: Number(event.offsetX), offsetY: Number(event.offsetY) },
        chart,
      );
    };
    chart.on("click", handler);
    chart.getZr().on("click", plotHandler);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.off("click", handler);
      chart.getZr().off("click", plotHandler);
      if (group) echarts.disconnect(group);
      chart.dispose();
      chartRef.current = null;
    };
  }, [group, option]);

  const canExport = Boolean(exportTitle && exportFileName && exportSections);
  return (
    <div className="chart-block">
      {canExport ? (
        <ExportActionMenu
          className="chart-export-menu"
          ariaLabel={`${exportTitle}导出操作`}
          actions={[
            {
              kind: "image",
              label: "保存图片",
              exportLabel: exportFileName || exportTitle || "CCER 图表",
              prepare: () => {
                const chart = chartRef.current;
                if (!chart || !exportTitle || !exportFileName) throw new Error("图表尚未准备完成。");
                return prepareChartImage({
                  dataUrl: chart.getDataURL({ pixelRatio: 2, backgroundColor: "#ffffff" }),
                  title: exportTitle,
                  fileName: exportFileName,
                });
              },
            },
            {
              kind: "data",
              label: "下载数据",
              exportLabel: exportFileName || exportTitle || "CCER 图表",
              prepare: () => prepareDataSections(exportFileName || "ccer-chart", exportSections || []),
              disabled: !(exportSections || []).some((section) => section.rows.length),
            },
          ]}
        />
      ) : null}
      <div ref={ref} className={className || "chart"} style={style} role="img" aria-label={ariaLabel} />
    </div>
  );
}

export { echarts };
