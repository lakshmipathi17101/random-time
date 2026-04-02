import { StyleSheet, Text, View, TextInput, TouchableOpacity } from "react-native";
import { darkColors } from "../theme";

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
      />
      <TouchableOpacity style={styles.settingsDangerButton} onPress={onDeleteAllDone}>
        <Text style={styles.settingsDangerText}>Delete all done tasks</Text>
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
});
