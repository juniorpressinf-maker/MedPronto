import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./medpronto-ux.css";
import "./prontuario-papel.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
