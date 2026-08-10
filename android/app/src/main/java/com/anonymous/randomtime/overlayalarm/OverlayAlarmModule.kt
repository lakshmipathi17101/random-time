package com.anonymous.randomtime.overlayalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Settings
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.LifecycleEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Phase 12 — OverlayAlarmModule.
 *
 * React Native bridge for the overlay alarm feature. Lets JS fire or dismiss
 * the WindowManager overlay alarm (via OverlayAlarmService) and receive
 * action events (done / postpone / reroll) that the overlay buttons broadcast.
 *
 * Registered in OverlayAlarmPackage and wired into MainApplication.
 *
 * ### JS surface
 * - `fireOverlayAlarm(taskId, taskTitle)` — checks SYSTEM_ALERT_WINDOW;
 *   rejects with `ERR_OVERLAY_NOT_GRANTED` if denied, otherwise starts the
 *   foreground service and resolves null.
 * - `dismissOverlayAlarm(taskId)` — tells the service to tear down the overlay.
 * - Event `overlayAlarmAction` — payload `{ taskId: string, action: string }`
 *   delivered whenever the user taps Done / Postpone / Re-roll on the overlay.
 *
 * ### Event emitter stubs
 * `addListener` / `removeListeners` are no-op stubs required by RN 0.65+ so
 * that `new NativeEventEmitter(NativeModules.OverlayAlarm)` doesn't emit the
 * "Did you forget to call…" warning.
 */
class OverlayAlarmModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), LifecycleEventListener {

    // -------------------------------------------------------------------------
    // LocalBroadcastReceiver — listens for alarm-action broadcasts from the service
    // -------------------------------------------------------------------------

    private val alarmActionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val taskId = intent.getStringExtra(OverlayAlarmService.EXTRA_TASK_ID) ?: return
            val action = intent.getStringExtra(OverlayAlarmService.EXTRA_ACTION) ?: return
            sendOverlayAlarmActionEvent(taskId, action)
        }
    }

    // -------------------------------------------------------------------------
    // Module identity
    // -------------------------------------------------------------------------

    override fun getName(): String = MODULE_NAME

    // -------------------------------------------------------------------------
    // Lifecycle — register / unregister the broadcast receiver
    // -------------------------------------------------------------------------

    override fun initialize() {
        super.initialize()
        reactContext.addLifecycleEventListener(this)
        LocalBroadcastManager.getInstance(reactContext).registerReceiver(
            alarmActionReceiver,
            IntentFilter(OverlayAlarmService.ALARM_ACTION_BROADCAST)
        )
    }

    override fun invalidate() {
        LocalBroadcastManager.getInstance(reactContext).unregisterReceiver(alarmActionReceiver)
        reactContext.removeLifecycleEventListener(this)
        super.invalidate()
    }

    // LifecycleEventListener — we only need the hook so the receiver stays
    // aligned with the React host lifecycle; no extra work needed here.
    override fun onHostResume() = Unit
    override fun onHostPause() = Unit
    override fun onHostDestroy() {
        LocalBroadcastManager.getInstance(reactContext).unregisterReceiver(alarmActionReceiver)
    }

    // -------------------------------------------------------------------------
    // @ReactMethod — fireOverlayAlarm
    // -------------------------------------------------------------------------

    @ReactMethod
    fun fireOverlayAlarm(taskId: String, taskTitle: String, promise: Promise) {
        if (!Settings.canDrawOverlays(reactContext)) {
            promise.reject(
                ERR_OVERLAY_NOT_GRANTED,
                "SYSTEM_ALERT_WINDOW permission is not granted. " +
                        "Call requestOverlayPermission() first."
            )
            return
        }
        val intent = Intent(reactContext, OverlayAlarmService::class.java).apply {
            action = OverlayAlarmService.ACTION_FIRE_OVERLAY
            putExtra(OverlayAlarmService.EXTRA_TASK_ID, taskId)
            putExtra(OverlayAlarmService.EXTRA_TASK_TITLE, taskTitle)
        }
        reactContext.startService(intent)
        promise.resolve(null)
    }

    // -------------------------------------------------------------------------
    // @ReactMethod — dismissOverlayAlarm
    // -------------------------------------------------------------------------

    @ReactMethod
    fun dismissOverlayAlarm(taskId: String, promise: Promise) {
        val intent = Intent(reactContext, OverlayAlarmService::class.java).apply {
            action = OverlayAlarmService.ACTION_DISMISS_OVERLAY
            putExtra(OverlayAlarmService.EXTRA_TASK_ID, taskId)
        }
        reactContext.startService(intent)
        promise.resolve(null)
    }

    // -------------------------------------------------------------------------
    // NativeEventEmitter stubs (RN 0.65+ requirement)
    // -------------------------------------------------------------------------

    @ReactMethod
    fun addListener(@Suppress("UNUSED_PARAMETER") eventName: String) {
        // No-op: the event emitter is driven by the LocalBroadcast receiver above.
    }

    @ReactMethod
    fun removeListeners(@Suppress("UNUSED_PARAMETER") count: Int) {
        // No-op.
    }

    // -------------------------------------------------------------------------
    // Internal — emit JS event
    // -------------------------------------------------------------------------

    private fun sendOverlayAlarmActionEvent(taskId: String, action: String) {
        if (!reactContext.hasActiveReactInstance()) return
        val payload = Arguments.createMap().apply {
            putString("taskId", taskId)
            putString("action", action)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(JS_EVENT_NAME, payload)
    }

    // -------------------------------------------------------------------------
    // Companion
    // -------------------------------------------------------------------------

    companion object {
        const val MODULE_NAME = "OverlayAlarm"
        const val JS_EVENT_NAME = "overlayAlarmAction"
        private const val ERR_OVERLAY_NOT_GRANTED = "ERR_OVERLAY_NOT_GRANTED"
    }
}
