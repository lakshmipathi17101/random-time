export type Theme = "dark" | "light";

export interface Colors {
  bg: string;
  bgCard: string;
  bgInput: string;
  bgBorder: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentDim: string;
  danger: string;
  success: string;
  warning: string;
}

export const darkColors: Colors = {
  bg: "#0f0f1a",
  bgCard: "#1a1a2e",
  bgInput: "#2a2a40",
  bgBorder: "#3a3a55",
  text: "#ffffff",
  textMuted: "#8888aa",
  textDim: "#555570",
  accent: "#6c63ff",
  accentDim: "#6c63ff33",
  danger: "#ff6b6b",
  success: "#4caf50",
  warning: "#f5a623",
};

export const lightColors: Colors = {
  bg: "#f0f0fa",
  bgCard: "#ffffff",
  bgInput: "#e8e8f8",
  bgBorder: "#ccccee",
  text: "#1a1a2e",
  textMuted: "#555577",
  textDim: "#9999bb",
  accent: "#6c63ff",
  accentDim: "#6c63ff22",
  danger: "#d93025",
  success: "#2e7d32",
  warning: "#e65100",
};
