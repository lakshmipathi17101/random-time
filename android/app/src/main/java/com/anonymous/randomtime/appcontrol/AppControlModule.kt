package com.anonymous.randomtime.appcontrol

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.text.TextUtils
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap

/**
 * Phase 11 — App Control native module.
 *
 * **This module is the JS-callable surface of the app-control feature.**
 * It exposes permission queries + deep-link launchers today (Phase 11.1),
 * and will grow in 11.2 (UsageStatsManager queries) and 11.3 (focus
 * session control + accessibility service hookup).
 *
 * The Kotlin file is split into focused sections so each capability stays
 * separately reviewable. Today's scope: **only permission plumbing**.
 *
 * ## Permissions in scope
 * - `PACKAGE_USAGE_STATS` — required for foreground detection in the
 *   Play Store flavor and for usage stats in both flavors. Granted via
 *   `Settings.ACTION_USAGE_ACCESS_SETTINGS`.
 * - `SYSTEM_ALERT_WINDOW` — required to draw the blocker overlay
 *   (sideload flavor only). Granted via
 *   `Settings.ACTION_MANAGE_OVERLAY_PERMISSION`.
 * - `BIND_ACCESSIBILITY_SERVICE` — required for real-time foreground
 *   monitoring + blocking (sideload flavor only). Granted via
 *   `Settings.ACTION_ACCESSIBILITY_SETTINGS`. The user must specifically
 *   enable our service from the list there.
 *
 * The module does **not** mutate state — these are pure queries and
 * intent launchers. The user always grants or denies in Settings.
 */
class AppControlModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = MODULE_NAME

  // ─── Permission queries ───────────────────────────────────────────────

  /**
   * Resolve with `{ usageStats: Bool, overlay: Bool, accessibility: Bool }`.
   * Each flag is the result of a focused helper, factored so they're
   * independently auditable + (in principle) JVM-testable.
   */
  @ReactMethod
  fun getPermissionStatus(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val map: WritableMap = Arguments.createMap()
      map.putBoolean("usageStats", isUsageStatsGranted(ctx))
      map.putBoolean("overlay", isOverlayGranted(ctx))
      map.putBoolean("accessibility", isAccessibilityServiceEnabled(ctx))
      promise.resolve(map)
    } catch (e: Exception) {
      promise.reject(ERR_PERMISSION_QUERY, e)
    }
  }

  // ─── Deep-link to Settings ─────────────────────────────────────────────
  //
  // Each request method opens the relevant Settings screen and resolves
  // immediately. We can't *grant* a permission ourselves; the user has to
  // toggle it. The JS layer polls `getPermissionStatus()` after the user
  // returns from Settings to learn the new state.

  @ReactMethod
  fun requestUsageStatsPermission(promise: Promise) {
    launchSettings(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS), promise)
  }

  @ReactMethod
  fun requestOverlayPermission(promise: Promise) {
    val intent = Intent(
        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
        Uri.parse("package:${reactApplicationContext.packageName}")
    )
    launchSettings(intent, promise)
  }

  @ReactMethod
  fun requestAccessibilityPermission(promise: Promise) {
    launchSettings(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS), promise)
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private fun launchSettings(intent: Intent, promise: Promise) {
    try {
      intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactApplicationContext.startActivity(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject(ERR_LAUNCH_SETTINGS, e)
    }
  }

  /**
   * PACKAGE_USAGE_STATS check. This is a "special permission" — it's
   * granted via AppOps rather than the runtime permission flow, so we
   * have to interrogate `AppOpsManager` directly.
   *
   * On Android Q+ we use `unsafeCheckOpNoThrow`. Older API levels use
   * the deprecated `checkOpNoThrow` (same semantics; only the name
   * changed).
   */
  private fun isUsageStatsGranted(ctx: Context): Boolean {
    val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as? AppOpsManager
        ?: return false
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          ctx.packageName
      )
    } else {
      @Suppress("DEPRECATION")
      appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          ctx.packageName
      )
    }
    return mode == AppOpsManager.MODE_ALLOWED
  }

  /**
   * SYSTEM_ALERT_WINDOW check. The framework helper `Settings.canDrawOverlays`
   * does the right thing across API levels (always true pre-M).
   */
  private fun isOverlayGranted(ctx: Context): Boolean {
    return Settings.canDrawOverlays(ctx)
  }

  /**
   * Accessibility-service-enabled check.
   *
   * There's no first-class API for "is *my* service enabled?" — the
   * canonical idiom is to read the secure setting
   * `enabled_accessibility_services` and look for our service component.
   *
   * Phase 11.3 will introduce `BlockerAccessibilityService`; this helper
   * is forward-compatible (it just looks for any service whose
   * ComponentName starts with our package).
   */
  private fun isAccessibilityServiceEnabled(ctx: Context): Boolean {
    val flat = Settings.Secure.getString(
        ctx.contentResolver,
        Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
    ) ?: return false
    if (TextUtils.isEmpty(flat)) return false
    val splitter = TextUtils.SimpleStringSplitter(':')
    splitter.setString(flat)
    val pkgPrefix = ctx.packageName
    for (component in splitter) {
      // component format: "com.package/.ServiceClass"
      if (component.startsWith("$pkgPrefix/")) return true
    }
    return false
  }

  companion object {
    const val MODULE_NAME = "AppControl"
    private const val ERR_PERMISSION_QUERY = "ERR_APP_CONTROL_PERMISSION_QUERY"
    private const val ERR_LAUNCH_SETTINGS = "ERR_APP_CONTROL_LAUNCH_SETTINGS"
  }
}
