import { useState, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import AddEventModal from "./AddEventModal";

const MAX_HISTORY = 10;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

function secondsToTime(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

function formatTime24(h: number, m: number, s: number): string {
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTime12(h: number, m: number, s: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${period}`;
}

interface TimeInputProps {
  label: string;
  hours: string;
  minutes: string;
  seconds: string;
  onChangeHours: (v: string) => void;
  onChangeMinutes: (v: string) => void;
  onChangeSeconds: (v: string) => void;
}

function TimeInput({
  label,
  hours,
  minutes,
  seconds,
  onChangeHours,
  onChangeMinutes,
  onChangeSeconds,
}: TimeInputProps) {
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
            placeholderTextColor="#999"
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
            placeholderTextColor="#999"
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
            placeholderTextColor="#999"
          />
          <Text style={styles.inputLabel}>sec</Text>
        </View>
      </View>
    </View>
  );
}

interface HistoryEntry {
  id: string;
  h: number;
  m: number;
  s: number;
}

export default function App() {
  const [minH, setMinH] = useState("00");
  const [minM, setMinM] = useState("00");
  const [minS, setMinS] = useState("00");

  const [maxH, setMaxH] = useState("23");
  const [maxM, setMaxM] = useState("59");
  const [maxS, setMaxS] = useState("59");

  const [result, setResult] = useState<{ h: number; m: number; s: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [is24h, setIs24h] = useState(true);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const parseVal = (v: string, max: number): number => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 0;
    return clamp(n, 0, max);
  };

  const formatResult = useCallback(
    (h: number, m: number, s: number) => {
      return is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
    },
    [is24h]
  );

  const generate = () => {
    const minHours = parseVal(minH, 23);
    const minMinutes = parseVal(minM, 59);
    const minSeconds = parseVal(minS, 59);

    const maxHours = parseVal(maxH, 23);
    const maxMinutes = parseVal(maxM, 59);
    const maxSeconds = parseVal(maxS, 59);

    const minTotal = timeToSeconds(minHours, minMinutes, minSeconds);
    const maxTotal = timeToSeconds(maxHours, maxMinutes, maxSeconds);

    if (minTotal > maxTotal) {
      setError("Min time must be less than or equal to max time");
      setResult(null);
      return;
    }

    setError(null);
    setCopied(false);
    const randomTotal =
      Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal;
    const { h, m, s } = secondsToTime(randomTotal);
    setResult({ h, m, s });

    const entry: HistoryEntry = { id: Date.now().toString(), h, m, s };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  };

  const copyToClipboard = async () => {
    if (!result) return;
    const text = formatResult(result.h, result.m, result.s);
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFormat = () => {
    setIs24h((prev) => !prev);
    setCopied(false);
  };

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Random Time</Text>
          <Text style={styles.subtitle}>Generator</Text>

          {/* Format Toggle */}
          <TouchableOpacity style={styles.toggleRow} onPress={toggleFormat}>
            <Text style={[styles.toggleOption, is24h && styles.toggleActive]}>
              24H
            </Text>
            <View style={styles.toggleTrack}>
              <View
                style={[
                  styles.toggleThumb,
                  !is24h && styles.toggleThumbRight,
                ]}
              />
            </View>
            <Text style={[styles.toggleOption, !is24h && styles.toggleActive]}>
              12H
            </Text>
          </TouchableOpacity>

          {/* Range Card */}
          <View style={styles.card}>
            <TimeInput
              label="From"
              hours={minH}
              minutes={minM}
              seconds={minS}
              onChangeHours={setMinH}
              onChangeMinutes={setMinM}
              onChangeSeconds={setMinS}
            />

            <View style={styles.divider} />

            <TimeInput
              label="To"
              hours={maxH}
              minutes={maxM}
              seconds={maxS}
              onChangeHours={setMaxH}
              onChangeMinutes={setMaxM}
              onChangeSeconds={setMaxS}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <TouchableOpacity style={styles.button} onPress={generate}>
            <Text style={styles.buttonText}>Generate</Text>
          </TouchableOpacity>

          {/* Result */}
          {result && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultLabel}>Your random time</Text>
              <Text style={styles.result}>
                {formatResult(result.h, result.m, result.s)}
              </Text>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={copyToClipboard}
                >
                  <Text style={styles.copyButtonText}>
                    {copied ? "Copied!" : "Copy"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calendarButton}
                  onPress={() => setModalVisible(true)}
                >
                  <Text style={styles.calendarButtonText}>Add to Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Add Event Modal */}
          {result && (
            <AddEventModal
              visible={modalVisible}
              eventHour={result.h}
              eventMinute={result.m}
              eventSecond={result.s}
              onClose={() => setModalVisible(false)}
            />
          )}

          {/* History */}
          {history.length > 0 && (
            <View style={styles.historyContainer}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>History</Text>
                <TouchableOpacity onPress={() => setHistory([])}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={history}
                scrollEnabled={false}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                  <View
                    style={[
                      styles.historyItem,
                      index === 0 && styles.historyItemLatest,
                    ]}
                  >
                    <Text style={styles.historyIndex}>#{index + 1}</Text>
                    <Text
                      style={[
                        styles.historyTime,
                        index === 0 && styles.historyTimeLatest,
                      ]}
                    >
                      {formatResult(item.h, item.m, item.s)}
                    </Text>
                  </View>
                )}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 36,
    fontWeight: "800",
    color: "#6c63ff",
    textAlign: "center",
    marginBottom: 24,
  },

  // Format toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  toggleOption: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555570",
  },
  toggleActive: {
    color: "#6c63ff",
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2a2a40",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6c63ff",
  },
  toggleThumbRight: {
    alignSelf: "flex-end",
  },

  // Card
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  timeInputGroup: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
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
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    width: 70,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#3a3a55",
  },
  inputLabel: {
    fontSize: 11,
    color: "#666680",
    marginTop: 4,
  },
  colon: {
    fontSize: 28,
    fontWeight: "700",
    color: "#6c63ff",
    marginHorizontal: 6,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a40",
    marginVertical: 16,
  },
  error: {
    color: "#ff6b6b",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },

  // Generate button
  button: {
    backgroundColor: "#6c63ff",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginTop: 28,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#6c63ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  // Result
  resultContainer: {
    marginTop: 32,
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 14,
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  result: {
    fontSize: 48,
    fontWeight: "800",
    color: "#6c63ff",
    letterSpacing: 3,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  copyButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6c63ff",
  },
  copyButtonText: {
    color: "#6c63ff",
    fontSize: 14,
    fontWeight: "600",
  },
  calendarButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#6c63ff",
  },
  calendarButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },

  // History
  historyContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  clearText: {
    fontSize: 13,
    color: "#ff6b6b",
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  historyItemLatest: {
    borderWidth: 1,
    borderColor: "#6c63ff33",
  },
  historyIndex: {
    fontSize: 13,
    color: "#555570",
    fontWeight: "600",
    width: 32,
  },
  historyTime: {
    fontSize: 18,
    fontWeight: "700",
    color: "#aaaacc",
    letterSpacing: 2,
  },
  historyTimeLatest: {
    color: "#6c63ff",
  },
});
