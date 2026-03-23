export interface AppTheme {
  bg: string;
  surface: string;
  surface2: string;
  surfaceSelected: string;
  border: string;
  accent: string;
  text: string;
  textMuted: string;
  textDim: string;
  textDim2: string;
  danger: string;
  historyText: string;
}

export const DARK: AppTheme = {
  bg: "#0f0f1a",
  surface: "#1a1a2e",
  surface2: "#2a2a40",
  surfaceSelected: "#1f1f35",
  border: "#3a3a55",
  accent: "#6c63ff",
  text: "#ffffff",
  textMuted: "#8888aa",
  textDim: "#666680",
  textDim2: "#555570",
  danger: "#ff6b6b",
  historyText: "#aaaacc",
};

export const LIGHT: AppTheme = {
  bg: "#f2f2fa",
  surface: "#ffffff",
  surface2: "#eef0f8",
  surfaceSelected: "#f0eeff",
  border: "#d0d0e4",
  accent: "#6c63ff",
  text: "#1a1a2e",
  textMuted: "#777799",
  textDim: "#9999bb",
  textDim2: "#aaaacc",
  danger: "#cc2222",
  historyText: "#555577",
};
