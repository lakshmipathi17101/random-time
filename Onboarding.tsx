import { useRef, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { requestNotificationPermission } from "./notificationService";
import nativeAppControl from "./nativeAppControl";
import { ONBOARDING_STEPS, completeOnboarding } from "./utils/onboarding";
import { AppTheme } from "./theme";

interface OnboardingProps {
  theme: AppTheme;
  onDone: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const LAST_STEP_INDEX = ONBOARDING_STEPS.length - 1;

export default function Onboarding({ theme, onDone }: OnboardingProps) {
  const s = makeStyles(theme);
  const scrollRef = useRef<ScrollView>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [granted, setGranted] = useState(false);

  const goToIndex = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setActiveIndex(index);
  };

  const handleMomentumScrollEnd = (
    e: NativeSyntheticEvent<NativeScrollEvent>
  ) => {
    const index = Math.round(
      e.nativeEvent.contentOffset.x / SCREEN_WIDTH
    );
    setActiveIndex(index);
  };

  const handleNext = () => {
    goToIndex(Math.min(activeIndex + 1, LAST_STEP_INDEX));
  };

  const handleGrant = async () => {
    try {
      await requestNotificationPermission();
    } catch {
      // Swallow — permission grant is best-effort and must never block flow.
    }
    try {
      await nativeAppControl.requestOverlayPermission();
    } catch {
      // Swallow — permission grant is best-effort and must never block flow.
    }
    setGranted(true);
  };

  const handleGetStarted = async () => {
    await completeOnboarding();
    onDone();
  };

  return (
    <View style={s.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumScrollEnd}
        style={s.scroll}
      >
        {ONBOARDING_STEPS.map((step) => (
          <View key={step.key} style={s.slide}>
            <Text style={s.title}>{step.title}</Text>
            <Text style={s.body}>{step.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={s.dots}>
        {ONBOARDING_STEPS.map((step, index) => (
          <View
            key={step.key}
            style={[s.dot, index === activeIndex ? s.dotActive : null]}
          />
        ))}
      </View>

      <View style={s.footer}>
        {activeIndex < LAST_STEP_INDEX ? (
          <TouchableOpacity style={s.primaryButton} onPress={handleNext}>
            <Text style={s.primaryButtonText}>Next</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[s.primaryButton, granted ? s.primaryButtonDisabled : null]}
              onPress={handleGrant}
              disabled={granted}
            >
              <Text style={s.primaryButtonText}>
                {granted ? "Granted" : "Grant"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.secondaryButton} onPress={handleGetStarted}>
              <Text style={s.secondaryButtonText}>Get started</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
    },
    scroll: {
      flex: 1,
    },
    slide: {
      width: SCREEN_WIDTH,
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 32,
    },
    title: {
      fontSize: 24,
      fontWeight: "700",
      color: t.text,
      textAlign: "center",
      marginBottom: 16,
    },
    body: {
      fontSize: 16,
      color: t.textMuted,
      textAlign: "center",
      lineHeight: 22,
    },
    dots: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginBottom: 16,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: t.border,
      marginHorizontal: 4,
    },
    dotActive: {
      backgroundColor: t.accent,
      width: 20,
    },
    footer: {
      paddingHorizontal: 32,
      paddingBottom: 32,
    },
    primaryButton: {
      backgroundColor: t.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      marginBottom: 12,
    },
    primaryButtonDisabled: {
      opacity: 0.6,
    },
    primaryButtonText: {
      color: t.text,
      fontSize: 16,
      fontWeight: "600",
    },
    secondaryButton: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
      borderWidth: 1,
      borderColor: t.border,
    },
    secondaryButtonText: {
      color: t.text,
      fontSize: 16,
      fontWeight: "600",
    },
  });
}
