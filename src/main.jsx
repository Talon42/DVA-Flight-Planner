import React from "react";
import ReactDOM from "react-dom/client";
import AppErrorBoundary from "./app/AppErrorBoundary.jsx";
import App from "./app/App.jsx";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);
