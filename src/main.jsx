import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

requestAnimationFrame(() => {
  document.body.dataset.appReady = "true";
  window.setTimeout(() => {
    const splash = document.getElementById("boot-splash");
    if (splash) {
      splash.hidden = true;
    }
  }, 200);
});
