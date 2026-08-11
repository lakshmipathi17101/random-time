package com.anonymous.randomtime.overlayalarm

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Phase 12 — ReactPackage that registers `OverlayAlarmModule`.
 *
 * Mirrors `AppControlPackage`: one native module, no view managers.
 * Register this in `MainApplication.kt` alongside `AppControlPackage`.
 */
class OverlayAlarmPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(OverlayAlarmModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
