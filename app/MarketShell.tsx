"use client";

import { useEffect, useState } from "react";
import CeaDashboardClient from "./CeaDashboardClient";
import DashboardClient from "./DashboardClient";

type Market = "ccer" | "cea";

const readMarket = (): Market => {
  if (typeof window === "undefined") return "ccer";
  return new URL(window.location.href).searchParams.get("market") === "cea" ? "cea" : "ccer";
};

export default function MarketShell() {
  const [market, setMarket] = useState<Market>(() => readMarket());
  const [switcherOpen, setSwitcherOpen] = useState(true);

  useEffect(() => {
    const handlePopState = () => setMarket(readMarket());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const switchMarket = (next: Market) => {
    setSwitcherOpen(false);
    if (next === market) return;
    const url = new URL(window.location.href);
    if (next === "cea") url.searchParams.set("market", "cea");
    else url.searchParams.delete("market");
    url.hash = "";
    window.history.pushState({ market: next }, "", url);
    setMarket(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="market-app-shell">
      <button
        type="button"
        className="market-switcher-toggle"
        aria-label={switcherOpen ? "收起市场切换栏" : "切换碳市场"}
        aria-expanded={switcherOpen}
        onClick={() => setSwitcherOpen((open) => !open)}
      >
        <span>市场</span>
        <strong>{market.toUpperCase()}</strong>
      </button>
      {!switcherOpen ? <div className="market-switcher-guide">点击左上角切换 CCER / CEA</div> : null}
      <aside className={`market-switcher ${switcherOpen ? "is-open" : ""}`} aria-label="碳市场类型切换" aria-hidden={!switcherOpen}>
        <div className="market-switcher-brand" aria-hidden="true">
          <span>CN</span>
          <strong>CARBON</strong>
        </div>
        <div className="market-switcher-options" role="tablist" aria-label="选择市场">
          <button
            type="button"
            role="tab"
            aria-selected={market === "ccer"}
            className={market === "ccer" ? "active" : ""}
            onClick={() => switchMarket("ccer")}
          >
            <span className="market-code">CCER</span>
            <span className="market-name">自愿碳市场</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={market === "cea"}
            className={market === "cea" ? "active" : ""}
            onClick={() => switchMarket("cea")}
          >
            <span className="market-code">CEA</span>
            <span className="market-name">强制碳市场</span>
          </button>
        </div>
        <div className="market-switcher-foot">NATIONAL MARKET OBSERVATORY</div>
      </aside>
      <div className="market-view" role="tabpanel">
        {market === "cea" ? <CeaDashboardClient /> : <DashboardClient />}
      </div>
    </div>
  );
}
