import DashboardClient from "./DashboardClient";
import { ExportAccessProvider } from "./components/ExportAccess";

export default function Home() {
  return (
    <ExportAccessProvider>
      <DashboardClient />
    </ExportAccessProvider>
  );
}
