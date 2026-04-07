import { StyleSheet, Text, View } from "react-native";
import { Task } from "../db";
import { darkColors } from "../theme";

interface StatsPanelProps {
  tasks: Task[];
}

export default function StatsPanel({ tasks }: StatsPanelProps) {
  const now = Date.now();
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const upcomingCount = tasks.filter(
    (t) => t.status === "pending" && new Date(t.event_date).getTime() >= now
  ).length;
  const overdueCount = tasks.filter(
    (t) => t.status === "pending" && new Date(t.event_date).getTime() < now
  ).length;
  const completionPct =
    tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <View style={styles.statsContainer}>
      <Text style={styles.statsTitle}>Statistics</Text>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: darkColors.accent }]}>
            {upcomingCount}
          </Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: darkColors.success }]}>
            {doneCount}
          </Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.statCard}>
          <Text
            style={[
              styles.statValue,
              { color: overdueCount > 0 ? darkColors.danger : darkColors.textMuted },
            ]}
          >
            {overdueCount}
          </Text>
          <Text style={styles.statLabel}>Overdue</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: darkColors.success }]}>
            {completionPct}%
          </Text>
          <Text style={styles.statLabel}>Done %</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: darkColors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: darkColors.bgCard,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: darkColors.text,
  },
  statLabel: {
    fontSize: 11,
    color: darkColors.textMuted,
    fontWeight: "600",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
