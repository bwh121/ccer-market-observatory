"use client";

import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";

type EChartProps = {
  option: EChartsOption;
  className?: string;
  style?: CSSProperties;
  onClick?: (params: Record<string, unknown>) => void;
  ariaLabel: string;
};

export function EChart({ option, className, style, onClick, ariaLabel }: EChartProps) {
  const ref = useRef<HTMLDivElement>(null);
  const clickRef = useRef(onClick);

  useEffect(() => {
    clickRef.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option, true);
    const handler = (params: Record<string, unknown>) => clickRef.current?.(params);
    chart.on("click", handler);
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.off("click", handler);
      chart.dispose();
    };
  }, [option]);

  return <div ref={ref} className={className || "chart"} style={style} role="img" aria-label={ariaLabel} />;
}

export { echarts };
