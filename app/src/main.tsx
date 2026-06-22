import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyThemeMode, readStoredThemeMode } from "./lib/themeMode";
import "./index.css";

applyThemeMode(readStoredThemeMode());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
