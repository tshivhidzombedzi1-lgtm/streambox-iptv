import { createRoot } from "react-dom/client";
import App from "./App";
import { isTV } from "./lib/catalog";
import { setupInstall } from "./lib/growth";
import "./index.css";

if (isTV) document.documentElement.classList.add("tv");
setupInstall();

createRoot(document.getElementById("root")!).render(<App />);
