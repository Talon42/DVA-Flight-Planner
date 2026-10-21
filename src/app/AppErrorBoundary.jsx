import React from "react";
import Button from "../components/ui/Button";
import Panel from "../components/ui/Panel";
import SectionHeader from "../components/ui/SectionHeader";
import { logAppError } from "../services/logging/appLog.client.js";

function buildRenderErrorMetadata(error, info) {
  const componentStack = String(info?.componentStack || "").trim();

  return {
    errorName: error instanceof Error ? error.name : "Error",
    errorMessage: error instanceof Error ? error.message : String(error || "Unknown render error"),
    componentStack: componentStack ? componentStack.slice(0, 4000) : null
  };
}

function buildErrorSignature(error, info) {
  const metadata = buildRenderErrorMetadata(error, info);
  return `${metadata.errorName}\u001f${metadata.errorMessage}\u001f${metadata.componentStack || ""}`;
}

// Catches root render crashes so the app can show a recoverable fallback instead of a blank screen.
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null,
      recoveryKey: 0,
      currentSignature: "",
      retriedSignature: ""
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    const signature = buildErrorSignature(error, info);
    if (signature !== this.state.currentSignature) this.setState({ currentSignature: signature });
    logAppError("app-render-failed", error, buildRenderErrorMetadata(error, info)).catch(() => {});
  }

  handleRetry = () => {
    const { currentSignature, retriedSignature } = this.state;
    if (!currentSignature || currentSignature === retriedSignature) return;
    this.setState((current) => ({
      error: null,
      recoveryKey: current.recoveryKey + 1,
      retriedSignature: currentSignature
    }));
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return <React.Fragment key={this.state.recoveryKey}>{this.props.children}</React.Fragment>;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-background)] p-4">
        <Panel className="w-full max-w-lg gap-4 p-6 shadow-lg">
          <SectionHeader eyebrow="Application" title="Unable to render the app" />
          <p className="text-sm leading-6 text-[color:var(--muted-text)]">
            The app hit a render error. Try again first. If the problem comes back, reload the app.
          </p>
          <div className="flex flex-wrap gap-3">
            {this.state.currentSignature !== this.state.retriedSignature ? (
              <Button onClick={this.handleRetry}>Try Again</Button>
            ) : null}
            <Button variant="ghost" onClick={this.handleReload}>
              Reload App
            </Button>
          </div>
        </Panel>
      </div>
    );
  }
}
