import { StyleSheet, Text, View } from "react-native";
import { Task } from "../db";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../theme";

interface StatsPanelProps {
  tasks: Task[];
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    statsContainer: {
      marginTop: 32,
      width: "100%",
      maxWidth: 400,
    },
    statsTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
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
      backgroundColor: colors.bgCard,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    statValue: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text,
    },
    statLabel: {
      fontSize: 11,
      color: colors.textMuted,
      fontWeight: "600",
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.8,
    },
  });
}

export default function StatsPanel({ tasks }: StatsPanelProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

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
          <Text style={[styles.statValue, { color: colors.accent }]}>
            {upcomingCount}
          </Text>
          <Text style={styles.statLabel}>Upcoming</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {doneCount}
          </Text>
          <Text style={styles.statLabel}>Done</Text>
        </View>
        <View style={styles.statCard}>
          <Text
            style={[
              styles.statValue,
              { color: overdueCount > 0 ? colors.danger : colors.textMuted },
            ]}
          >
            {overdueCount}
          </Text>
          <Text style={styles.statLabel}>Overdue</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: colors.success }]}>
            {completionPct}%
          </Text>
          <Text style={styles.statLabel}>Done %</Text>
        </View>
      </View>
    </View>
  );
}
