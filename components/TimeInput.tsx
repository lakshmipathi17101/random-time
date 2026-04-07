import { StyleSheet, Text, View, TextInput } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../theme";

interface TimeInputProps {
  label: string;
  hours: string;
  minutes: string;
  seconds: string;
  onChangeHours: (v: string) => void;
  onChangeMinutes: (v: string) => void;
  onChangeSeconds: (v: string) => void;
}

export default function TimeInput({
  label,
  hours,
  minutes,
  seconds,
  onChangeHours,
  onChangeMinutes,
  onChangeSeconds,
}: TimeInputProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  return (
    <View style={styles.timeInputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.timeRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={hours}
            onChangeText={onChangeHours}
            placeholder="HH"
            placeholderTextColor={colors.textDim}
          />
          <Text style={styles.inputLabel}>hrs</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={minutes}
            onChangeText={onChangeMinutes}
            placeholder="MM"
            placeholderTextColor={colors.textDim}
          />
          <Text style={styles.inputLabel}>min</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={seconds}
            onChangeText={onChangeSeconds}
            placeholder="SS"
            placeholderTextColor={colors.textDim}
          />
          <Text style={styles.inputLabel}>sec</Text>
        </View>
      </View>
    </View>
  );
}

function makeStyles(colors: Colors) { return StyleSheet.create({
  timeInputGroup: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrapper: {
    alignItems: "center",
  },
  input: {
    backgroundColor: colors.bgInput,
    color: colors.text,
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    width: 70,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.bgBorder,
  },
  inputLabel: {
    fontSize: 11,
    color: colors.textDim,
    marginTop: 4,
  },
  colon: {
    fontSize: 28,
    fontWeight: "700",
    color: colors.accent,
    marginHorizontal: 6,
    marginBottom: 16,
  },
}); }
