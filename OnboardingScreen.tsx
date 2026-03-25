import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface Slide {
  icon: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: "🎲",
    title: "Welcome to\nRandomTime",
    body: "Stop overthinking when to do things.\nLet chance decide — and follow through.",
  },
  {
    icon: "⏱",
    title: "Generate\nRandom Times",
    body: "Set a time range, tap Generate.\nGet one or several random times instantly.\nBias toward certain hours, skip lunch breaks.",
  },
  {
    icon: "📅",
    title: "Schedule &\nGet Reminded",
    body: "Save times as tasks with calendar events.\nGet reminder notifications before they arrive.\nRecurring tasks? Daily or weekly — covered.",
  },
  {
    icon: "🚀",
    title: "You're All Set!",
    body: "Presets save your favourite configurations.\nStatistics track your completion rate.\nTime to embrace a little randomness.",
  },
];

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const isLast = activeIndex === SLIDES.length - 1;

  const goNext = () => {
    if (isLast) {
      onComplete();
    } else {
      setActiveIndex((i) => i + 1);
    }
  };

  const slide = SLIDES[activeIndex];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipButton} onPress={onComplete}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slide content */}
      <ScrollView
        contentContainerStyle={styles.slideContent}
        scrollEnabled={false}
      >
        <Text style={styles.icon}>{slide.icon}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </ScrollView>

      {/* Dots */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => setActiveIndex(i)}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* CTA button */}
      <View style={styles.buttonArea}>
        <TouchableOpacity style={styles.nextButton} onPress={goNext}>
          <Text style={styles.nextButtonText}>
            {isLast ? "Get Started" : "Next"}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  skipButton: {
    position: "absolute",
    top: 56,
    right: 24,
    zIndex: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  skipText: {
    color: "#666680",
    fontSize: 15,
    fontWeight: "600",
  },
  slideContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
    paddingBottom: 20,
    minWidth: SCREEN_WIDTH,
  },
  icon: {
    fontSize: 80,
    marginBottom: 32,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
    lineHeight: 42,
    marginBottom: 20,
  },
  body: {
    fontSize: 17,
    color: "#aaaacc",
    textAlign: "center",
    lineHeight: 26,
  },
  dotsRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 10,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2a2a40",
  },
  dotActive: {
    backgroundColor: "#6c63ff",
    width: 24,
  },
  buttonArea: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  nextButton: {
    backgroundColor: "#6c63ff",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  nextButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
});
