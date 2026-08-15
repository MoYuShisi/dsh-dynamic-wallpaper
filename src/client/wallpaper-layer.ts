/**
 * The wallpaper DOM layer: a fixed, pointer-transparent, lowest-z stack behind
 * the whole application. Renders <img> slides (multi-image wallpaper with
 * optional rotation), a single animated GIF, or a muted looping <video>, and
 * applies opacity / blur / speed. The same service also applies the FONT
 * settings (UI zoom + text colors + gradient text) to `#root` / body —
 * independent of whether the wallpaper is enabled.
 *
 * Layering: the layer sits at z-index 0; an injected rule lifts `#root`
 * (position: relative; z-index: 1) above it, and while the wallpaper is
 * enabled the `--dsw-alias-bg-base` and `--dsw-specific-sidebar-fill` tokens
 * are forced transparent ON BODY (the theme declares the alias tokens on
 * `body`, light and dark alike), so the frame, conversation column, and the
 * sidebar let the wallpaper show through. Message bubbles and tool cards keep
 * their own opaque fills, so content stays readable. Everything is reverted on
 * disable/teardown.
 *
 * The layer subscribes to the controller's snapshot but only re-renders when
 * the APPLIED wallpaper or APPLIED font settings change — draft (staged)
 * edits never touch the renderer until "确定更换" (applyDraft) promotes them.
 */
import type {
  FontSettings, WallpaperController, WallpaperSettings, SourceRef,
} from './controller.ts'
import { fontSettingsEqual, inferType, settingsEqual } from './controller.ts'

const LAYER_ID = 'dsh-dynamic-wallpaper'

/**
 * Selector caveat: the `data-dsh-wallpaper` attribute is set via
 * `toggleAttribute(name, enabled)`, which yields an EMPTY attribute value, so
 * the selectors below must be presence-based (`[data-dsh-wallpaper]`), never
 * value-based (`[data-dsh-wallpaper='on']`).
 */
const GLOBAL_CSS = [
  `#${LAYER_ID} { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; background: rgba(8, 12, 28, 0.55); }`,
  `#${LAYER_ID}[data-hidden] { display: none; }`,
  `#${LAYER_ID} img, #${LAYER_ID} video { width: 100%; height: 100%; object-fit: cover; display: block; border: 0; }`,
  // The theme declares the alias tokens on `body` (both palettes), so the
  // transparency overrides must live on body too; the injected style tag comes
  // after the theme sheets, which wins the equal-specificity dark-mode tie.
  // The workspace background (--dsw-alias-bg-base: frame + conversation +
  // details) is ALWAYS transparent while the wallpaper is enabled, so the
  // uploaded wallpaper shows in the conversation area. FULLSCREEN additionally
  // makes the sidebar transparent; with fullscreen OFF the sidebar keeps its
  // opaque fill and only the conversation area shows the wallpaper.
  `body[data-dsh-wallpaper] { --dsw-alias-bg-base: transparent; background: transparent; }`,
  `body[data-dsh-wallpaper][data-dsh-fullscreen] { --dsw-specific-sidebar-fill: transparent; }`,
  // Font zoom: `zoom` scales the whole app UI (the wallpaper layer stays
  // fixed, being outside #root). `--dsh-wallpaper-zoom` is set inline on body.
  // Fixed full-screen dialogs (settings modal and the shared Modal —
  // `role="presentation"` wrappers hosting a `role="dialog"`) are counter-
  // zoomed with the inverse factor, so the settings page and its font stay at
  // 100% while the main interface scales.
  `#root { position: relative; z-index: 1; zoom: var(--dsh-wallpaper-zoom, 1); }`,
  `#root [role='presentation']:has([role='dialog']) { zoom: var(--dsh-wallpaper-zoom-inverse, 1); }`,
  // Gradient text: paint TEXT-LEVEL elements only (headings, paragraphs,
  // spans, links, labels, list items, inline code, ...) with
  // background-clip: text. Containers (divs, pre), form controls, and buttons
  // are deliberately NOT clipped, so message bubbles, tool cards, inputs, and
  // modal panels keep their opaque fills. `background-attachment: fixed`
  // anchors every element's background to the VIEWPORT, so the whole page
  // shares ONE continuous gradient (per direction, through the 5 stop colors)
  // instead of each element restarting its own.
  `body[data-dsh-text-gradient] { --dsh-wallpaper-gradient: linear-gradient(var(--dsh-wallpaper-gradient-angle, 180deg), var(--dsh-wallpaper-gradient-colors)); }`,
  `body[data-dsh-text-gradient] :where(h1, h2, h3, h4, h5, h6, p, span, a, label, li, td, th, strong, em, small, code, summary, blockquote, dt, dd, figcaption) { color: transparent !important; -webkit-text-fill-color: transparent !important; background-image: var(--dsh-wallpaper-gradient) !important; background-attachment: fixed !important; -webkit-background-clip: text !important; background-clip: text !important; }`,
].join('\n')

/** Gradient sweep angles per selectable direction (fixed to the viewport). */
const GRADIENT_ANGLES: Record<FontSettings['gradientDirection'], string> = {
  vertical: '180deg',
  horizontal: '90deg',
  diagonal: '135deg',
}

/** One rendered child inside the layer. */
type LayerChild = HTMLImageElement | HTMLVideoElement

export class WallpaperLayer {
  private readonly root: HTMLDivElement
  private readonly style: HTMLStyleElement
  private readonly unsubscribe: () => void
  private readonly onVisibility = (): void => {
    if (document.hidden) {
      this.video?.pause()
    } else {
      this.resumeVideo()
    }
  }

  private media: LayerChild | null = null
  private video: HTMLVideoElement | null = null
  /** The applied wallpaper settings the renderer last reconciled against. */
  private lastApplied: WallpaperSettings | null = null
  /** The applied font settings last applied to body/#root. */
  private lastFont: FontSettings | null = null
  /**
   * Identity of the media content currently mounted (or being mounted).
   * Claim-based: set before the async mount starts and only cleared on
   * teardown, so a stale mount aborts itself instead of stranding an empty
   * layer when a newer reconcile supersedes it.
   */
  private mountedKey = ''
  /** Current slideshow slide index (type 'image'). */
  private slideIndex = 0
  private rotationTimer: ReturnType<typeof setInterval> | null = null
  private rotationInterval = 0

  /**
   * Mount the layer and subscribe to the controller.
   * @param controller - the settings source of truth.
   */
  constructor(private readonly controller: WallpaperController) {
    this.style = document.createElement('style')
    this.style.dataset.plugin = LAYER_ID
    this.style.textContent = GLOBAL_CSS
    document.head.appendChild(this.style)

    this.root = document.createElement('div')
    this.root.id = LAYER_ID
    document.body.appendChild(this.root)

    document.addEventListener('visibilitychange', this.onVisibility)
    this.unsubscribe = controller.observable.subscribe(() => { this.onSnapshot() })
    this.applyAll()
  }

  /** Re-render only when the APPLIED wallpaper or font settings changed (draft edits are inert). */
  private onSnapshot(): void {
    const applied = this.controller.getApplied()
    const font = this.controller.getFontApplied()
    let changed = false
    if (this.lastApplied === null || !settingsEqual(this.lastApplied, applied)) {
      this.lastApplied = applied
      changed = true
    }
    if (this.lastFont === null || !fontSettingsEqual(this.lastFont, font)) {
      this.lastFont = font
      changed = true
    }
    if (changed) this.applyAll()
  }

  /** Apply the wallpaper layer, then the font styles (fonts are independent of the wallpaper). */
  private applyAll(): void {
    this.applyWallpaper()
    this.applyFontStyles()
  }

  /** Re-apply the whole wallpaper layer to the current applied settings. */
  private applyWallpaper(): void {
    const applied = this.controller.getApplied()
    document.body.toggleAttribute('data-dsh-wallpaper', applied.enabled)
    document.body.toggleAttribute('data-dsh-fullscreen', applied.enabled && applied.fullscreen)
    this.root.toggleAttribute('data-hidden', !applied.enabled)
    this.root.style.opacity = String(applied.opacity / 100)

    if (!applied.enabled) {
      this.pauseDynamic()
      this.clearRotation()
      this.controller.clearError()
      return
    }
    this.resumeVideo()
    if (this.video !== null) this.video.playbackRate = applied.speed

    if (applied.type === 'image') {
      this.video = null
      this.syncRotation(applied)
      if (this.slideIndex >= applied.images.length && applied.images.length > 0) {
        this.slideIndex = applied.images.length - 1
      }
    } else {
      this.clearRotation()
      this.slideIndex = 0
    }

    // Resolve which source renders, with a type/kind coherence check.
    const src = applied.type === 'image' ? applied.images[this.slideIndex] ?? null : applied.source
    if (src === null) {
      this.controller.clearError()
      this.clearMedia()
      this.mountedKey = ''
      return
    }
    const kind = inferType(src.mime, src.name)
    const coherent = applied.type === 'video' ? kind === 'video' : kind !== 'video'
    if (!coherent) {
      // A video payload cannot render through <img> and vice versa — fail loud
      // in the settings row instead of silently showing nothing.
      this.controller.reportError('mismatch')
      this.clearMedia()
      this.mountedKey = ''
      return
    }
    this.controller.clearError()
    const key = renderKey(applied, this.slideIndex, src)
    if (key !== this.mountedKey) {
      this.mountedKey = key
      void this.mountMedia(applied, src, key)
    } else {
      this.applyBlur(applied.blur)
    }
  }

  /** Start/stop the slideshow rotation timer per the applied settings. */
  private syncRotation(applied: WallpaperSettings): void {
    const shouldRun = applied.rotate && applied.images.length > 1
    if (!shouldRun) {
      this.clearRotation()
      return
    }
    const seconds = Math.max(1, applied.rotateInterval)
    if (this.rotationTimer !== null) {
      if (seconds === this.rotationInterval) return
      this.clearRotation()
    }
    this.rotationInterval = seconds
    this.rotationTimer = setInterval(() => {
      if (document.hidden) return
      const current = this.controller.getApplied()
      const count = current.images.length
      if (count < 2) return
      let next: number
      if (current.rotateOrder === 'random') {
        do {
          next = Math.floor(Math.random() * count)
        } while (next === this.slideIndex)
      } else {
        next = (this.slideIndex + 1) % count
      }
      this.slideIndex = next
      this.applyWallpaper()
    }, seconds * 1000)
  }

  private clearRotation(): void {
    if (this.rotationTimer !== null) {
      clearInterval(this.rotationTimer)
      this.rotationTimer = null
    }
  }

  /** Mount (or refresh) the <img>/<video> child for the resolved source. */
  private async mountMedia(applied: WallpaperSettings, source: SourceRef, key: string): Promise<void> {
    let url: string | null
    try {
      url = await this.controller.resolveUrl(source)
    } catch {
      this.controller.reportError('load')
      this.clearMedia()
      this.mountedKey = ''
      return
    }
    if (this.mountedKey !== key) return // superseded or disposed while loading
    if (url === null) {
      // Payload unavailable (blob gone): surface the failure and allow a
      // later retry.
      this.controller.reportError('load')
      this.clearMedia()
      this.mountedKey = ''
      return
    }
    this.clearMedia()
    if (applied.type === 'video') {
      const video = document.createElement('video')
      video.src = url
      video.autoplay = true
      video.muted = true
      video.defaultMuted = true
      video.loop = true
      video.playsInline = true
      video.preload = 'auto'
      video.playbackRate = applied.speed
      video.addEventListener('error', () => {
        // Codec/transport failure — surface it in the settings row.
        this.controller.reportError('decode')
      })
      this.video = video
      this.media = video
      this.root.appendChild(video)
      this.resumeVideo()
    } else {
      const img = document.createElement('img')
      img.src = url
      img.alt = ''
      img.draggable = false
      img.addEventListener('error', () => {
        // Decode failure (unsupported format / corrupted payload).
        this.controller.reportError('decode')
      })
      this.media = img
      this.root.appendChild(img)
    }
    this.applyBlur(applied.blur)
  }

  private clearMedia(): void {
    this.media?.remove()
    this.media = null
    this.video = null
  }

  private pauseDynamic(): void {
    this.video?.pause()
  }

  private resumeVideo(): void {
    if (this.video === null || document.hidden) return
    void this.video.play().catch(() => {
      // Autoplay can be denied until a user gesture; the layer simply stays
      // paused, and the next reconcile retries.
    })
  }

  private applyBlur(blur: number): void {
    if (this.media === null) return
    this.media.style.filter = blur > 0 ? `blur(${blur}px)` : ''
  }

  /**
   * Apply the font settings to body/#root: UI zoom, text-color overrides and
   * the 5-stop gradient, via inline custom properties on body (inline styles
   * outrank the theme sheets, dark palette included). Applies regardless of
   * the wallpaper switch; empty values restore the theme.
   */
  private applyFontStyles(): void {
    const font = this.controller.getFontApplied()
    const body = document.body
    const style = body.style
    const ratio = font.zoom / 100
    style.setProperty('--dsh-wallpaper-zoom', String(ratio))
    style.setProperty('--dsh-wallpaper-zoom-inverse', String(1 / ratio))
    if (font.gradientText) {
      body.setAttribute('data-dsh-text-gradient', '')
      style.setProperty('--dsh-wallpaper-gradient-colors', gradientStops(font.gradientColors))
      style.setProperty('--dsh-wallpaper-gradient-angle', GRADIENT_ANGLES[font.gradientDirection])
      style.removeProperty('--dsw-alias-label-primary')
      style.removeProperty('--dsw-alias-label-secondary')
      return
    }
    body.removeAttribute('data-dsh-text-gradient')
    style.removeProperty('--dsh-wallpaper-gradient-colors')
    style.removeProperty('--dsh-wallpaper-gradient-angle')
    if (font.textColor === '') style.removeProperty('--dsw-alias-label-primary')
    else style.setProperty('--dsw-alias-label-primary', font.textColor)
    if (font.textSecondaryColor === '') style.removeProperty('--dsw-alias-label-secondary')
    else style.setProperty('--dsw-alias-label-secondary', font.textSecondaryColor)
  }

  /** Tear the layer down completely (plugin teardown). */
  dispose(): void {
    this.mountedKey = '\u0000disposed'
    this.unsubscribe()
    document.removeEventListener('visibilitychange', this.onVisibility)
    this.clearRotation()
    this.clearMedia()
    this.controller.dispose()
    this.root.remove()
    this.style.remove()
    document.body.removeAttribute('data-dsh-wallpaper')
    document.body.removeAttribute('data-dsh-fullscreen')
    document.body.removeAttribute('data-dsh-text-gradient')
    document.body.style.removeProperty('--dsh-wallpaper-zoom')
    document.body.style.removeProperty('--dsh-wallpaper-zoom-inverse')
    document.body.style.removeProperty('--dsw-alias-label-primary')
    document.body.style.removeProperty('--dsw-alias-label-secondary')
    document.body.style.removeProperty('--dsh-wallpaper-gradient-colors')
    document.body.style.removeProperty('--dsh-wallpaper-gradient-angle')
  }
}

/** Stable identity of the currently rendered media, for change detection. */
function renderKey(settings: WallpaperSettings, slideIndex: number, source: SourceRef): string {
  return `${settings.type}|${settings.type === 'image' ? `${slideIndex}|` : ''}${source.id ?? source.dataUrl ?? ''}`
}

/** Render the 5 gradient stops as an evenly-spaced CSS color-stop list. */
function gradientStops(colors: readonly string[]): string {
  const count = Math.max(1, colors.length)
  return colors.map((color, i) => `${color} ${(i * 100) / (count - 1)}%`).join(', ')
}
