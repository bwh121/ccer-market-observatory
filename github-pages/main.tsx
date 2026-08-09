import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import DashboardClient from "../app/DashboardClient";
import { ExportAccessProvider } from "../app/components/ExportAccess";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing root element");

createRoot(root).render(
  <StrictMode>
    <ExportAccessProvider>
      <DashboardClient />
    </ExportAccessProvider>
  </StrictMode>,
);
