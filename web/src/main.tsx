import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./lib/i18n";
import App from "./App";

// After an update is published, an app that was already open may try to load an
// on-demand piece of code (PDF, Excel) under its old file name and fail. Reload once
// so the fresh version takes over instead of showing "Failed to fetch dynamically imported module".
window.addEventListener("vite:preloadError", (event) => {
  const key = "cs.reloaded-at";
  const last = Number(sessionStorage.getItem(key) ?? 0);
  if (Date.now() - last < 60_000) return; // never loop
  sessionStorage.setItem(key, String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
