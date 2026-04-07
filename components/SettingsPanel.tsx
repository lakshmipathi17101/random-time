import { Linking, StyleSheet, Text, View, TextInput, TouchableOpacity } from "react-native";
import { darkColors } from "../theme";

const APP_VERSION = "1.0.0";
const PRIVACY_POLICY_URL = "https://lakshmipathi17101.github.io/random-time/privacy";

interface SettingsPanelProps {
  defaultReminder: string;
  onChangeDefaultReminder: (v: string) => void;
  onDeleteAllDone: () => void;
}

export default function SettingsPanel({
  defaultReminder,
  onChangeDefaultReminder,
  onDeleteAllDone,
}: SettingsPanelProps) {
  return (
    <View style={styles.settingsPanel}>
      <Text style={styles.settingsSectionLabel}>Default Reminder (minutes)</Text>
      <TextInput
        style={styles.settingsInput}
        keyboardType="number-pad"
        maxLength={3}
        value={defaultReminder}
        onChangeText={onChangeDefaultReminder}
        placeholderTextColor={darkColors.textDim}
        placeholder="10"
        accessibilityLabel="Default reminder time in minutes"
      />

      <TouchableOpacity
        style={styles.settingsDangerButton}
        onPress={onDeleteAllDone}
        accessibilityRole="button"
        accessibilityLabel="Delete all done tasks"
      >
        <Text style={styles.settingsDangerText}>Delete all done tasks</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      <Text style={styles.settingsSectionLabel}>About</Text>
      <View style={styles.aboutRow}>
        <Text style={styles.aboutLabel}>Version</Text>
        <Text style={styles.aboutValue}>{APP_VERSION}</Text>
      </View>
      <TouchableOpacity
        onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
        accessibilityRole="link"
        accessibilityLabel="Open Privacy Policy"
      >
        <Text style={styles.aboutLink}>Privacy Policy</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsPanel: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: darkColors.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 10,
  },
  settingsSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: darkColors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  settingsInput: {
    backgroundColor: darkColors.bgInput,
    color: darkColors.text,
    fontSize: 15,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: darkColors.bgBorder,
    width: 100,
  },
  settingsDangerButton: {
    marginTop: 4,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: `${darkColors.danger}44`,
    alignItems: "center",
  },
  settingsDangerText: {
    color: darkColors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  divider: {
    height: 1,
    backgroundColor: darkColors.bgBorder,
    marginVertical: 4,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aboutLabel: {
    fontSize: 13,
    color: darkColors.textMuted,
  },
  aboutValue: {
    fontSize: 13,
    color: darkColors.text,
    fontWeight: "600",
  },
  aboutLink: {
    fontSize: 13,
    color: darkColors.accent,
    fontWeight: "600",
  },
});
