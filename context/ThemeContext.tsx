import React, { createContext, useContext, useMemo } from "react";
import { Colors, darkColors, lightColors } from "../theme";

interface ThemeContextValue {
  colors: Colors;
  theme: "dark" | "light";
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  theme: "dark",
});

interface ThemeProviderProps {
  theme: "dark" | "light";
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: theme === "dark" ? darkColors : lightColors,
      theme,
    }),
    [theme]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
