import { useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  FlatList,
  ActivityIndicator,
} from "react-native";
import {
  getPresets,
  insertPreset,
  deletePreset,
  Preset,
  PresetConfig,
  WeightedRange,
  ExcludedBlock,
} from "./db";
import * as Haptics from "expo-haptics";

interface PresetsModalProps {
  visible: boolean;
  onClose: () => void;
  currentConfig: PresetConfig;
  onLoadPreset: (config: PresetConfig) => void;
}

export default function PresetsModal({
  visible,
  onClose,
  currentConfig,
  onLoadPreset,
}: PresetsModalProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPresets(await getPresets());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      setNewName("");
      reload();
    }
  }, [visible, reload]);

  const handleSave = async () => {
    const name = newName.trim();
    if (!name) {
      Alert.alert("Name required", "Enter a name for this preset.");
      return;
    }
    setSaving(true);
    try {
      await insertPreset(name, currentConfig);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNewName("");
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (preset: Preset) => {
    const config: PresetConfig = JSON.parse(preset.config_json);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLoadPreset(config);
    onClose();
  };

  const handleDelete = (preset: Preset) => {
    Alert.alert(
      "Delete Preset",
      `Delete "${preset.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePreset(preset.id);
            await reload();
          },
        },
      ]
    );
  };

  const describeConfig = (config: PresetConfig): string => {
    const weights: WeightedRange[] = config.weights ?? [];
    const excluded: ExcludedBlock[] = config.excluded ?? [];
    const parts: string[] = [
      `${config.minH}:${config.minM}:${config.minS} – ${config.maxH}:${config.maxM}:${config.maxS}`,
    ];
    if (weights.length > 0) parts.push(`${weights.length} weight${weights.length > 1 ? "s" : ""}`);
    if (excluded.length > 0) parts.push(`${excluded.length} block${excluded.length > 1 ? "s" : ""} excluded`);
    return parts.join(" · ");
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Generator Presets</Text>

          {/* Save current config */}
          <Text style={styles.sectionLabel}>Save Current Settings</Text>
          <View style={styles.saveRow}>
            <TextInput
              style={styles.nameInput}
              placeholder="Preset name…"
              placeholderTextColor="#666680"
              value={newName}
              onChangeText={setNewName}
            />
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.configPreview}>
            {describeConfig(currentConfig)}
          </Text>

          {/* List */}
          <Text style={styles.sectionLabel}>Saved Presets</Text>
          {loading ? (
            <ActivityIndicator color="#6c63ff" style={{ marginTop: 16 }} />
          ) : presets.length === 0 ? (
            <Text style={styles.emptyText}>No presets yet. Save one above!</Text>
          ) : (
            <FlatList
              data={presets}
              keyExtractor={(p) => String(p.id)}
              style={styles.list}
              renderItem={({ item }) => {
                let cfg: PresetConfig | null = null;
                try { cfg = JSON.parse(item.config_json); } catch { /* skip */ }
                return (
                  <View style={styles.presetItem}>
                    <View style={styles.presetInfo}>
                      <Text style={styles.presetName}>{item.name}</Text>
                      {cfg && (
                        <Text style={styles.presetDesc}>{describeConfig(cfg)}</Text>
                      )}
                    </View>
                    <View style={styles.presetActions}>
                      <TouchableOpacity
                        style={styles.loadButton}
                        onPress={() => handleLoad(item)}
                      >
                        <Text style={styles.loadButtonText}>Load</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => handleDelete(item)}
                      >
                        <Text style={styles.deleteButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          )}

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 8,
  },
  saveRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  nameInput: {
    flex: 1,
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 15,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  saveButton: {
    backgroundColor: "#6c63ff",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  configPreview: {
    fontSize: 12,
    color: "#666680",
    marginTop: 6,
    marginBottom: 4,
  },
  list: {
    maxHeight: 280,
  },
  presetItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2a2a40",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  presetInfo: {
    flex: 1,
  },
  presetName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  presetDesc: {
    fontSize: 12,
    color: "#666680",
    marginTop: 2,
  },
  presetActions: {
    flexDirection: "row",
    gap: 8,
  },
  loadButton: {
    backgroundColor: "#6c63ff",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  loadButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
  },
  deleteButton: {
    backgroundColor: "#3a2a40",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  deleteButtonText: {
    color: "#ff6b6b",
    fontWeight: "700",
    fontSize: 13,
  },
  emptyText: {
    color: "#666680",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 8,
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3a3a55",
    alignItems: "center",
  },
  closeButtonText: {
    color: "#8888aa",
    fontSize: 16,
    fontWeight: "600",
  },
});
