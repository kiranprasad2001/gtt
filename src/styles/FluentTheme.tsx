import {
  FluentProvider,
  webDarkTheme,
  webLightTheme,
} from "@fluentui/react-components";
import { useEffect, useState } from "react";

const darkMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

export function FluentTheme({ children }: { children: JSX.Element }) {
  const [isDark, setIsDark] = useState(darkMediaQuery.matches);

  useEffect(() => {
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    darkMediaQuery.addEventListener("change", handler);
    return () => darkMediaQuery.removeEventListener("change", handler);
  }, []);

  return (
    <FluentProvider theme={isDark ? webDarkTheme : webLightTheme}>
      {children}
    </FluentProvider>
  );
}
