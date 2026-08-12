import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import MarketShell from "../app/MarketShell";
import { ExportAccessProvider } from "../app/components/ExportAccess";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <ExportAccessProvider>
      <MarketShell />
    </ExportAccessProvider>
  </StrictMode>,
);
