/**
 * Dynamic-wallpaper plugin, browser half: owns the wallpaper + font controller
 * and the wallpaper layer, and registers TWO feature-owned rows into the
 * General settings section — "动态壁纸" (media) and "字体" (zoom/text colors/
 * gradient) — both from this same package. All state lives in the controller
 * (localStorage + IndexedDB); the layer renders the APPLIED settings and the
 * rows edit their DRAFTS until each "确定更换" button promotes them.
 * Cross-plugin collaboration goes through slots/services — the only value
 * imports are platform module-table externals.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the settings slot declarations and the ctx.locale merge.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { DEFAULT_FONT, DEFAULT_SETTINGS, WallpaperController, type WallpaperSnapshot } from './controller.ts'
import { WallpaperLayer } from './wallpaper-layer.ts'
import { WallpaperRow, type WallpaperRowInjected } from './WallpaperRow.tsx'
import { FontRow, type FontRowInjected } from './FontRow.tsx'
import { en, zh, type WallpaperKey } from './locales.ts'

/** Dictionary namespace owned by this plugin (both rows' copy). */
const NS = 'settings.wallpaper'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The dynamic-wallpaper + font settings rows' copy. */
    'settings.wallpaper': WallpaperKey
  }
}

export type { WallpaperRowComponentProps, WallpaperRowInjected } from './WallpaperRow.tsx'
export type { FontRowComponentProps, FontRowInjected } from './FontRow.tsx'
export type {
  SourceRef, WallpaperSettings, WallpaperSnapshot, FontSettings, WallpaperType,
  GradientDirection, RotateOrder, MediaErrorCode,
} from './controller.ts'

/** Read-only observable for hosts without a DOM (rows render defaults only). */
const NULL_OBSERVABLE: HostObservable<WallpaperSnapshot> = {
  getSnapshot: () => Object.freeze({
    draft: DEFAULT_SETTINGS,
    applied: DEFAULT_SETTINGS,
    font: Object.freeze({ draft: DEFAULT_FONT, applied: DEFAULT_FONT }),
    error: null,
  }),
  subscribe: () => () => undefined,
}

/** Required services: the slot registry and the locale service. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: mount the wallpaper layer and register the two settings
 * rows.
 * @param ctx - client cordis context.
 */
export function apply(ctx: ClientContext): void {
  // Browser-only work: e2e/jsdom hosts that boot the client tree without a
  // full DOM still get the settings rows, but no wallpaper layer.
  const hasDom = typeof document !== 'undefined' && typeof localStorage !== 'undefined'
  const controller = hasDom ? new WallpaperController() : undefined

  if (controller !== undefined) {
    ctx.effect(() => {
      const layer = new WallpaperLayer(controller)
      return () => { layer.dispose() }
    }, 'dsh-dynamic-wallpaper: layer')
  }

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-dynamic-wallpaper: dictionaries')

  const wallpaperInjected = (): WallpaperRowInjected => {
    if (controller === undefined) {
      return {
        hooks: { config: NULL_OBSERVABLE },
        setEnabled: () => undefined,
        setDraft: () => undefined,
        applyDraft: () => undefined,
        addImage: () => undefined,
        removeImage: () => undefined,
        moveImage: () => undefined,
        setSource: () => undefined,
        clearSource: () => undefined,
      }
    }
    return {
      hooks: { config: controller.observable },
      setEnabled: (enabled) => { controller.setEnabled(enabled) },
      setDraft: (patch) => { controller.setDraft(patch) },
      applyDraft: () => { controller.applyDraft() },
      addImage: (file) => { void controller.addImage(file) },
      removeImage: (index) => { controller.removeImage(index) },
      moveImage: (index, delta) => { controller.moveImage(index, delta) },
      setSource: (file) => { void controller.setSource(file) },
      clearSource: () => { controller.clearSource() },
    }
  }

  const fontInjected = (): FontRowInjected => {
    if (controller === undefined) {
      return {
        hooks: { config: NULL_OBSERVABLE },
        setFontDraft: () => undefined,
        applyFontDraft: () => undefined,
        setGradientColor: () => undefined,
      }
    }
    return {
      hooks: { config: controller.observable },
      setFontDraft: (patch) => { controller.setFontDraft(patch) },
      applyFontDraft: () => { controller.applyFontDraft() },
      setGradientColor: (index, color) => { controller.setGradientColor(index, color) },
    }
  }

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'dynamic-wallpaper',
    order: 30,
    locale: NS,
    inject: wallpaperInjected,
  }, WallpaperRow))

  ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'dynamic-font',
    order: 40,
    locale: NS,
    inject: fontInjected,
  }, FontRow))
}
