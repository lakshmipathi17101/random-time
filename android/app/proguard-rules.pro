# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Phase 11 app-control — the bridge calls getName()/getConstants() and
# @ReactMethod functions by reflection. Keep the whole package so
# R8 / ProGuard release builds don't strip the entry points.
-keep class com.anonymous.randomtime.appcontrol.** { *; }

# Add any project specific keep options here:
