import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
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
  import("./app/store").then(({ useApp }) => {
    const message = event.reason instanceof Error ? event.reason.message : String(event.reason);
    useApp.getState().toast(message, null, "error");
  });
});
