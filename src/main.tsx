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
  const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
  useApp.getState().toast(message, null, "error");
});
