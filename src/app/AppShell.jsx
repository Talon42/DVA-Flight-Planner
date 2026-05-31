import AppTopBar from "./AppTopBar";
import AppMainWorkspace from "./AppMainWorkspace";
import AppOverlayHost from "./AppOverlayHost";

// Renders the persistent app shell and the modal chrome around the content panes.
export default function AppShell(props) {
  return (
    <div className="flex h-screen min-h-screen flex-col gap-6 overflow-hidden p-6 bp-1024:gap-3 bp-1024:p-3.5">
      <AppTopBar {...props} />
      <AppMainWorkspace {...props} />
      <AppOverlayHost {...props} />
    </div>
  );
}
