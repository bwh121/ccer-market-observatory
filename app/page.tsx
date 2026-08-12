import MarketShell from "./MarketShell";
import { ExportAccessProvider } from "./components/ExportAccess";

export default function Home() {
  return (
    <ExportAccessProvider>
      <MarketShell />
    </ExportAccessProvider>
  );
}
