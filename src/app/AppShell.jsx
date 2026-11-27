import AppTopBar from "./AppTopBar";
import AppMainWorkspace from "./AppMainWorkspace";
import AppOverlayHost from "./AppOverlayHost";
import { cn } from "../components/ui/cn";
import LiveAnnouncer from "../components/layout/LiveAnnouncer";

// Renders the persistent app shell and the modal chrome around the content panes.
export default function AppShell(props) {
  const isSyncPopupVisible = props.isSyncing || props.isRefreshingLogbook;

  return (
    <div className="flex h-screen min-h-screen flex-col gap-6 overflow-auto p-6 bp-1024:gap-3 bp-1024:overflow-hidden bp-1024:p-3.5">
      {/* While a blocking sync runs the page behind the progress dialog is inert, not just dimmed (WCAG 1.3.2, 2.4.3). */}
      <div
        className={cn("flex min-h-0 flex-1 flex-col gap-6 bp-1024:gap-3", isSyncPopupVisible && "opacity-50")}
        {...(isSyncPopupVisible ? { inert: "" } : {})}
      >
        <AppTopBar {...props} />
        <AppMainWorkspace {...props} />
      </div>
      <AppOverlayHost {...props} />
      <LiveAnnouncer />
    </div>
  );
}
