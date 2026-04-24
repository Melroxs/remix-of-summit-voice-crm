import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import summitLogoUrl from "@/assets/summit-logo.webp?url";

// Preload the LCP image (logo on Auth screen) using Vite's hashed URL.
// Injected here so the browser discovers it before React renders.
const preloadLogo = document.createElement("link");
preloadLogo.rel = "preload";
preloadLogo.as = "image";
preloadLogo.type = "image/webp";
preloadLogo.href = summitLogoUrl;
(preloadLogo as HTMLLinkElement & { fetchPriority?: string }).fetchPriority = "high";
document.head.appendChild(preloadLogo);

createRoot(document.getElementById("root")!).render(<App />);
