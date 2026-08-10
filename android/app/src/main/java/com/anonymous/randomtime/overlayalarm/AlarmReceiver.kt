package com.anonymous.randomtime.overlayalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Phase 12 — AlarmReceiver.
 *
 * BroadcastReceiver that the AlarmManager fires when a scheduled overlay
 * alarm becomes due.  It extracts the taskId and taskTitle from the Intent
 * extras and forwards them to OverlayAlarmService with ACTION_FIRE_OVERLAY.
 *
 * Registered in AndroidManifest.xml with android:exported="false" so only
 * this app's AlarmManager PendingIntents can trigger it.
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val taskId    = intent.getStringExtra(OverlayAlarmService.EXTRA_TASK_ID)    ?: return
        val taskTitle = intent.getStringExtra(OverlayAlarmService.EXTRA_TASK_TITLE) ?: ""

        val serviceIntent = Intent(context, OverlayAlarmService::class.java).apply {
            action = OverlayAlarmService.ACTION_FIRE_OVERLAY
            putExtra(OverlayAlarmService.EXTRA_TASK_ID,    taskId)
            putExtra(OverlayAlarmService.EXTRA_TASK_TITLE, taskTitle)
        }
        context.startService(serviceIntent)
    }
}
