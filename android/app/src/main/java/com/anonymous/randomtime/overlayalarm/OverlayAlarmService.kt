package com.anonymous.randomtime.overlayalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.os.IBinder
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * Phase 12 — OverlayAlarmService.
 *
 * A one-shot foreground service that draws a WindowManager overlay when an
 * alarm fires. It does NOT use any React Native UI component — the overlay
 * is built entirely from native Android views so it can appear even when
 * the JS thread is busy or the Activity is in the background.
 *
 * Intent actions:
 *   ACTION_FIRE_OVERLAY   — show the overlay; extras: taskId (String), taskTitle (String)
 *   ACTION_DISMISS_OVERLAY — remove the overlay silently (e.g. user handled it elsewhere)
 *
 * Overlay buttons send a local broadcast with action ALARM_ACTION_BROADCAST
 * and extras {taskId, action: "done"|"postpone"|"reroll"}, then stop the service.
 *
 * Returns START_NOT_STICKY — one-shot; OS will not restart if killed.
 */
class OverlayAlarmService : Service() {

    // WindowManager + attached view reference (null when no overlay is shown)
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Must call startForeground unconditionally on every start — including
        // ACTION_DISMISS_OVERLAY — so Android never throws
        // ForegroundServiceDidNotStartInTimeException regardless of which action
        // triggered this delivery.
        startForegroundCompat()
        when (intent?.action) {
            ACTION_FIRE_OVERLAY -> {
                val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: ""
                val taskTitle = intent.getStringExtra(EXTRA_TASK_TITLE) ?: ""
                showOverlay(taskId, taskTitle)
            }
            ACTION_DISMISS_OVERLAY -> {
                removeOverlay()
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        removeOverlay()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // -------------------------------------------------------------------------
    // Foreground notification
    // -------------------------------------------------------------------------

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Overlay Alarm Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Keeps the overlay alarm service alive in the foreground"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun startForegroundCompat() {
        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Alarm active")
            .setContentText("Your random time has arrived.")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // API 34+: foregroundServiceType must be declared in the manifest
            // (we use specialUse as the catch-all for overlay alarm type).
            startForeground(
                NOTIFICATION_ID,
                notification,
                android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    // -------------------------------------------------------------------------
    // Overlay
    // -------------------------------------------------------------------------

    private fun showOverlay(taskId: String, taskTitle: String) {
        // Remove any leftover overlay from a previous fire.
        removeOverlay()

        val wm = windowManager ?: return

        val overlayType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            overlayType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dp(48)  // 48dp bottom margin
        }

        // Build the card layout programmatically (no XML required).
        val card = buildOverlayCard(taskId, taskTitle)

        // Apply 32dp left/right margin via padding on the outer wrapper.
        val sidePadding = dp(32)
        card.setPadding(sidePadding, dp(16), sidePadding, dp(16))

        overlayView = card
        try {
            wm.addView(card, params)
        } catch (e: Exception) {
            // Catches android.view.WindowManager.BadTokenException when the
            // SYSTEM_ALERT_WINDOW permission was revoked between schedule and fire,
            // and any other unexpected WindowManager error.
            android.util.Log.e(TAG, "Failed to add overlay view — stopping service", e)
            // Remove the view if it was partially attached to avoid leaking it.
            try {
                wm.removeView(card)
            } catch (_: Exception) {
                // View was never attached; ignore.
            }
            overlayView = null
            stopSelf()
        }
    }

    /**
     * Builds the dark card layout:
     *   LinearLayout (VERTICAL)
     *     TextView  — task title (bold, 18sp)
     *     LinearLayout (HORIZONTAL)
     *       Button "Done"
     *       Button "Postpone"
     *       Button "Re-roll"
     */
    private fun buildOverlayCard(taskId: String, taskTitle: String): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#CC1A1A2E"))  // dark semi-transparent
        }

        val titleView = TextView(this).apply {
            text = taskTitle
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            setTypeface(typeface, Typeface.BOLD)
            val vPad = dp(8)
            setPadding(0, vPad, 0, vPad)
        }
        card.addView(titleView)

        val buttonRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            val rowParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            layoutParams = rowParams
        }

        val buttonWeight = 1f
        for ((label, actionKey) in listOf(
            "Done" to "done",
            "Postpone" to "postpone",
            "Re-roll" to "reroll"
        )) {
            val btn = Button(this).apply {
                text = label
                setTextColor(Color.WHITE)
                val btnParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, buttonWeight)
                layoutParams = btnParams
                setOnClickListener {
                    sendAlarmBroadcast(taskId, actionKey)
                    removeOverlay()
                    stopSelf()
                }
            }
            buttonRow.addView(btn)
        }

        card.addView(buttonRow)
        return card
    }

    private fun removeOverlay() {
        val view = overlayView ?: return
        val wm = windowManager ?: return
        try {
            wm.removeView(view)
        } catch (_: Exception) {
            // View may have already been detached; swallow.
        }
        overlayView = null
    }

    // -------------------------------------------------------------------------
    // Broadcast
    // -------------------------------------------------------------------------

    private fun sendAlarmBroadcast(taskId: String, action: String) {
        val intent = Intent(ALARM_ACTION_BROADCAST).apply {
            putExtra(EXTRA_TASK_ID, taskId)
            putExtra(EXTRA_ACTION, action)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /** Convert dp to pixels using the display density. */
    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density + 0.5f).toInt()

    // -------------------------------------------------------------------------
    // Companion object — constants
    // -------------------------------------------------------------------------

    companion object {
        private const val TAG = "OverlayAlarmService"

        const val ACTION_FIRE_OVERLAY = "com.anonymous.randomtime.ACTION_FIRE_OVERLAY"
        const val ACTION_DISMISS_OVERLAY = "com.anonymous.randomtime.ACTION_DISMISS_OVERLAY"
        const val ALARM_ACTION_BROADCAST = "com.anonymous.randomtime.OVERLAY_ALARM_ACTION"

        const val EXTRA_TASK_ID = "taskId"
        const val EXTRA_TASK_TITLE = "taskTitle"
        const val EXTRA_ACTION = "action"

        private const val NOTIFICATION_CHANNEL_ID = "overlay_alarm_service"
        private const val NOTIFICATION_ID = 7001
    }
}
