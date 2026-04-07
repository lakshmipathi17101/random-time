import { useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useTheme } from "../context/ThemeContext";

const SLIDES = [
  {
    icon: "🎲",
    title: "Random time, on demand",
    body: "Set a time range — seconds, hours, anything in between — and generate a random time instantly. Use it to break routine, randomise your schedule, or just add a little chance to your day.",
  },
  {
    icon: "📅",
    title: "Save it as a task",
    body: "Turn any generated time into a task. Add a title, notes, category, and priority. It gets saved to your calendar and lives in your task list so nothing slips through the cracks.",
  },
  {
    icon: "🔔",
    title: "Get notified at the right moment",
    body: "Choose how far in advance you want a reminder — 5, 10, 30 minutes, or a custom time. A second alarm fires at the exact event time so you're always on cue.",
  },
];

const { width } = Dimensions.get("window");

interface OnboardingScreenProps {
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const { colors } = useTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const styles = makeStyles(colors);

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setActiveIndex(index);
  };

  const handleNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      goToSlide(activeIndex + 1);
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(onDone);
    }
  };

  const handleScroll = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <TouchableOpacity style={styles.skipButton} onPress={onDone}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScroll}
        scrollEventThrottle={16}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={styles.slide}>
            <Text style={styles.icon}>{slide.icon}</Text>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Dot indicators */}
      <View style={styles.dotsRow}>
        {SLIDES.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => goToSlide(i)}>
            <View
              style={[
                styles.dot,
                i === activeIndex ? styles.dotActive : styles.dotInactive,
              ]}
            />
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>
          {activeIndex < SLIDES.length - 1 ? "Next" : "Get Started"}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function makeStyles(colors: ReturnType<typeof useTheme>["colors"]) {
  return StyleSheet.create({
    container: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.bg,
      zIndex: 100,
      alignItems: "center",
      justifyContent: "center",
    },
    skipButton: {
      position: "absolute",
      top: 60,
      right: 24,
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.bgBorder,
    },
    skipText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    slide: {
      width,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 36,
      paddingTop: 80,
      paddingBottom: 40,
    },
    icon: {
      fontSize: 72,
      marginBottom: 28,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginBottom: 16,
      lineHeight: 34,
    },
    body: {
      fontSize: 16,
      color: colors.textMuted,
      textAlign: "center",
      lineHeight: 26,
    },
    dotsRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 40,
      marginBottom: 28,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    dotActive: {
      backgroundColor: colors.accent,
      width: 24,
    },
    dotInactive: {
      backgroundColor: colors.bgBorder,
    },
    primaryButton: {
      backgroundColor: colors.accent,
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: 16,
      width: width - 48,
      alignItems: "center",
      marginBottom: 48,
      shadowColor: colors.accent,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 5,
    },
    primaryButtonText: {
      color: "#ffffff",
      fontSize: 18,
      fontWeight: "700",
    },
  });
}
