import { StyleSheet, Text, View, TextInput, TouchableOpacity } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../theme";

interface SettingsPanelProps {
  defaultReminder: string;
  onChangeDefaultReminder: (v: string) => void;
  onDeleteAllDone: () => void;
  theme: "dark" | "light";
  onChangeTheme: (t: "dark" | "light") => void;
}

export default function SettingsPanel({
  defaultReminder,
  onChangeDefaultReminder,
  onDeleteAllDone,
  theme,
  onChangeTheme,
}: SettingsPanelProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  return (
    <View style={styles.settingsPanel}>
      <Text style={styles.settingsSectionLabel}>Default Reminder (minutes)</Text>
      <TextInput
        style={styles.settingsInput}
        keyboardType="number-pad"
        maxLength={3}
        value={defaultReminder}
        onChangeText={onChangeDefaultReminder}
        placeholderTextColor={colors.textDim}
        placeholder="10"
      />

      <Text style={[styles.settingsSectionLabel, { marginTop: 12 }]}>Theme</Text>
      <View style={styles.themeRow}>
        {(["dark", "light"] as const).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.themeChip, theme === t && styles.themeChipActive]}
            onPress={() => onChangeTheme(t)}
          >
            <Text style={[styles.themeChipText, theme === t && styles.themeChipTextActive]}>
              {t === "dark" ? "🌙 Dark" : "☀️ Light"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.settingsDangerButton} onPress={onDeleteAllDone}>
        <Text style={styles.settingsDangerText}>Delete all done tasks</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    settingsPanel: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: colors.bgCard,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      gap: 10,
    },
    settingsSectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    settingsInput: {
      backgroundColor: colors.bgInput,
      color: colors.text,
      fontSize: 15,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.bgBorder,
      width: 100,
    },
    themeRow: {
      flexDirection: "row",
      gap: 10,
    },
    themeChip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.bgBorder,
      backgroundColor: colors.bgInput,
    },
    themeChipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    themeChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
    },
    themeChipTextActive: {
      color: "#ffffff",
    },
    settingsDangerButton: {
      marginTop: 4,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: `${colors.danger}44`,
      alignItems: "center",
    },
    settingsDangerText: {
      color: colors.danger,
      fontSize: 13,
      fontWeight: "600",
    },
  });
}
