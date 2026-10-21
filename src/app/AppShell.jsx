import AppTopBar from "./AppTopBar";
import AppMainWorkspace from "./AppMainWorkspace";
import AppOverlayHost from "./AppOverlayHost";
import { cn } from "../components/ui/cn";

// Renders the persistent app shell and the modal chrome around the content panes.
export default function AppShell(props) {
  const isSyncPopupVisible = props.isSyncing || props.isRefreshingLogbook;

  return (
    <div className="flex h-screen min-h-screen flex-col gap-6 overflow-hidden p-6 bp-1024:gap-3 bp-1024:p-3.5">
      <div className={cn("flex min-h-0 flex-1 flex-col gap-6 bp-1024:gap-3", isSyncPopupVisible && "opacity-50")}>
        <AppTopBar {...props} />
        <AppMainWorkspace {...props} />
      </div>
      <AppOverlayHost {...props} />
    </div>
  );
}
