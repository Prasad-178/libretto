import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
const studio = /^\/studio\/?$/.test(window.location.pathname);
const Page = studio
  ? lazy(() => import("./Studio"))
  : lazy(() => import("./Home"));
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense
      fallback={
        <div role="status" style={{ padding: 32, fontFamily: "sans-serif" }}>
          Loading Libretto…
        </div>
      }
    >
      <Page />
    </Suspense>
  </StrictMode>,
);
