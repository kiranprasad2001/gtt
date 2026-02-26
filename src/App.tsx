import { Link as LinkFluent, Title1 } from "@fluentui/react-components";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, Outlet } from "react-router";

import "./App.css";
import { NavBar } from "./components/nav/NavBar.js";

const queryClient = new QueryClient();

// for @tanstack/react-query dev tools
declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import("@tanstack/query-core").QueryClient;
  }
}
window.__TANSTACK_QUERY_CLIENT__ = queryClient;

function App() {
  const [width, setWidth] = useState(window.innerWidth);
  const { t } = useTranslation();
  const resizeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleResize = useCallback(() => {
    if (resizeTimer.current) clearTimeout(resizeTimer.current);
    resizeTimer.current = setTimeout(() => {
      setWidth(window.innerWidth);
    }, 150);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", handleResize, false);
    window.addEventListener("orientationchange", handleResize, false);
    return () => {
      window.removeEventListener("resize", handleResize, false);
      window.removeEventListener("orientationchange", handleResize, false);
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
    };
  }, [handleResize]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="container">
        <header className="nav-bar">
          <Link
            className="router-link"
            to={"/"}
            title={t("home.title.tooltip") ?? ""}
          >
            <LinkFluent>
              <Title1 className="app-title text-xl font-bold">
                {t("home.title.name")}
              </Title1>
            </LinkFluent>
          </Link>
          {width >= 800 && <NavBar width={width} />}
        </header>
        <Outlet />
        {width < 800 && <NavBar width={width} />}
      </div>
    </QueryClientProvider>
  );
}

export default App;
