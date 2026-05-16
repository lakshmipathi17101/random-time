package com.anonymous.randomtime.appcontrol

import android.view.View
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ReactShadowNode
import com.facebook.react.uimanager.ViewManager

/**
 * Phase 11 — ReactPackage that registers `AppControlModule`.
 *
 * Kept dead simple: one module, no view managers, no shadow nodes. If we
 * grow a custom view (e.g. an in-app blocker overlay for previewing what
 * sideload users will see), it'll be added here.
 */
class AppControlPackage : ReactPackage {

  override fun createNativeModules(
      reactContext: ReactApplicationContext
  ): List<NativeModule> = listOf(AppControlModule(reactContext))

  override fun createViewManagers(
      reactContext: ReactApplicationContext
  ): List<ViewManager<View, ReactShadowNode<*>>> = emptyList()
}
