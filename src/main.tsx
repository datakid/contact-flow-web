import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { useApp } from "./app/store";
import "./styles/index.css";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

window.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
  const reason: unknown = event.reason;
  const name = reason instanceof Error || reason instanceof DOMException ? reason.name : "";
  const message = reason instanceof Error ? reason.message : String(reason);
  if (name === "AbortError" || /cancel/i.test(message)) return;
  useApp.getState().toast(message, null, "error");
});
