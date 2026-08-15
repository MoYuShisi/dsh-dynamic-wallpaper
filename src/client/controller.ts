/**
 * Wallpaper settings state, persistence, and the file payload lifecycle.
 *
 * The plugin owns TWO independent, staged settings documents, surfaced as two
 * rows in Settings → General by the same package:
 *
 *   - Wallpaper (`draft`/`applied`): type, media, rotation, opacity, blur,
 *     speed. Persisted under {@link STORAGE_KEY}.
 *   - Font (`font.draft`/`font.applied`): UI zoom, text colors, gradient
 *     text. Persisted under {@link FONT_STORAGE_KEY}. Applies regardless of
 *     whether the wallpaper is enabled.
 *
 * Each pair follows the same staged model: the row edits the DRAFT, and
 * nothing takes effect or persists until its "确定更换" (applyDraft) button
 * promotes the draft to applied. File payloads never leave the browser: small
 * files are stored inline as data URLs, large ones (videos) as IndexedDB
 * blobs referenced by an opaque id. Uploads are routed by file kind,
 * independently of the selected type: images join the slideshow list
 * (`images`), GIFs and videos fill the single `source` slot — so "choose type
 * then upload" and "upload then choose type" both work.
 */
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import { deleteBlob, getBlob, putBlob } from './blob-store.ts'

/** Wallpaper rendering modes selectable in the settings row. */
export type WallpaperType = 'image' | 'gif' | 'video'

/** Gradient sweep direction for gradient text. */
export type GradientDirection = 'vertical' | 'horizontal' | 'diagonal'

/** Slideshow rotation order for the multi-image wallpaper. */
export type RotateOrder = 'sequence' | 'random'

/** Media failure codes surfaced in the wallpaper settings row. */
export type MediaErrorCode = 'load' | 'decode' | 'mismatch'

/**
 * Reference to one uploaded file payload. `data` keeps the whole file inline
 * (small images); `blob` points at an IndexedDB record (GIFs/videos).
 */
export interface SourceRef {
  kind: 'data' | 'blob'
  /** Original file name for display. */
  name: string
  /** MIME type, used to route the file and pick the renderer. */
  mime: string
  /** File size in bytes. */
  size: number
  /** kind === 'data': base64 data URL of the whole file. */
  dataUrl?: string
  /** kind === 'blob': opaque IndexedDB record id. */
  id?: string
}

/** The wallpaper settings document (draft or applied). */
export interface WallpaperSettings {
  /** Master switch; the layer is removed from the page while false. */
  enabled: boolean
  type: WallpaperType
  /** 0–100, applied as layer opacity. */
  opacity: number
  /** 0–20 px Gaussian blur on the media element. */
  blur: number
  /** 0.5–2 playback multiplier (video only). */
  speed: number
  /** Slideshow sources for type 'image' (one per slide). */
  images: SourceRef[]
  /** Single source for types 'gif' and 'video'. */
  source: SourceRef | null
  /** Slideshow rotation on/off (type 'image' with 2+ images). */
  rotate: boolean
  /** Slideshow interval in seconds. */
  rotateInterval: number
  /** Slideshow rotation order. */
  rotateOrder: RotateOrder
  /**
   * Fullscreen wallpaper: when true the app background (frame, conversation
   * column) turns transparent so the wallpaper shows through everywhere;
   * when false the workspace keeps its opaque background and only the sidebar
   * shows the wallpaper.
   */
  fullscreen: boolean
}

/** The font settings document (draft or applied) — independent of the wallpaper. */
export interface FontSettings {
  /** Whole-interface zoom in percent (80–150); 100 = no zoom. */
  zoom: number
  /**
   * App text color override (CSS color, e.g. '#ffcc00'); '' follows the theme.
   */
  textColor: string
  /** Secondary app text color override; '' follows the theme. */
  textSecondaryColor: string
  /**
   * Gradient-text master switch: paints app text with a linear gradient
   * through {@link gradientColors} instead of a solid color. While on, the
   * solid text color overrides are inactive. The gradient is fixed to the
   * viewport (`background-attachment: fixed`), so the whole page shares ONE
   * continuous gradient instead of each text element restarting its own.
   */
  gradientText: boolean
  /** Gradient stop colors, exactly {@link GRADIENT_STOP_COUNT} of them. */
  gradientColors: string[]
  /** Gradient sweep direction. */
  gradientDirection: GradientDirection
}

/** One staged pair's live state. */
export interface FontSnapshot {
  /** Font settings being edited (staged, not yet live). */
  draft: FontSettings
  /** Font settings the app renders (persisted). */
  applied: FontSettings
}

/** What the rows and the layer each read from the shared observable. */
export interface WallpaperSnapshot {
  /** Wallpaper settings being edited (staged, not yet live). */
  draft: WallpaperSettings
  /** Wallpaper settings the layer renders (persisted). */
  applied: WallpaperSettings
  /** Font settings pair (independent of the wallpaper). */
  font: FontSnapshot
  /** Last wallpaper media failure surfaced to the row (transient). */
  error: MediaErrorCode | null
}

/** localStorage key of the applied wallpaper settings document. */
export const STORAGE_KEY = 'dsh.dynamic-wallpaper'

/** localStorage key of the applied font settings document. */
export const FONT_STORAGE_KEY = 'dsh.dynamic-wallpaper.font'

/** Files at or below this size are stored inline as data URLs (localStorage budget). */
export const INLINE_LIMIT = 256 * 1024

/** Number of gradient stop colors. */
export const GRADIENT_STOP_COUNT = 5

/** Default gradient palette (used before the user picks colors). */
export const DEFAULT_GRADIENT_COLORS: readonly string[] = [
  '#4f8cff', '#6ea8ff', '#c06bff', '#ff7ac6', '#ffb35c',
]

const TYPES: readonly WallpaperType[] = ['image', 'gif', 'video']
const DIRECTIONS: readonly GradientDirection[] = ['vertical', 'horizontal', 'diagonal']
const ORDERS: readonly RotateOrder[] = ['sequence', 'random']

/** Fresh wallpaper defaults; used before the first write and after a corrupt read. */
export const DEFAULT_SETTINGS: WallpaperSettings = Object.freeze({
  enabled: false,
  type: 'image',
  opacity: 80,
  blur: 0,
  speed: 1,
  images: [],
  source: null,
  rotate: false,
  rotateInterval: 5,
  rotateOrder: 'sequence',
  fullscreen: true,
})

/** Fresh font defaults. */
export const DEFAULT_FONT: FontSettings = Object.freeze({
  zoom: 100,
  textColor: '',
  textSecondaryColor: '',
  gradientText: false,
  gradientColors: [...DEFAULT_GRADIENT_COLORS],
  gradientDirection: 'vertical',
})

/**
 * Route an uploaded file by its kind, independently of the selected type:
 * images join the slideshow list, GIFs and videos fill the single source slot.
 * @param mime - the browser-reported MIME type (may be '').
 * @param name - the original file name, for the extension fallback.
 */
export function inferType(mime: string, name = ''): WallpaperType {
  const lower = name.toLowerCase()
  if (mime.startsWith('video/')
    || lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) {
    return 'video'
  }
  if (mime === 'image/gif' || lower.endsWith('.gif')) return 'gif'
  return 'image'
}

/**
 * Whether two wallpaper documents are equivalent (used for the staged-state
 * "确定更换" enablement and the layer's change detection).
 */
export function settingsEqual(a: WallpaperSettings, b: WallpaperSettings): boolean {
  if (a === b) return true
  return a.enabled === b.enabled
    && a.type === b.type
    && a.opacity === b.opacity
    && a.blur === b.blur
    && a.speed === b.speed
    && a.rotate === b.rotate
    && a.rotateInterval === b.rotateInterval
    && a.rotateOrder === b.rotateOrder
    && a.fullscreen === b.fullscreen
    && a.source === b.source
    && a.images.length === b.images.length
    && a.images.every((ref, i) => ref === b.images[i])
}

/** Whether two font documents are equivalent. */
export function fontSettingsEqual(a: FontSettings, b: FontSettings): boolean {
  if (a === b) return true
  return a.zoom === b.zoom
    && a.textColor === b.textColor
    && a.textSecondaryColor === b.textSecondaryColor
    && a.gradientText === b.gradientText
    && a.gradientDirection === b.gradientDirection
    && a.gradientColors.length === b.gradientColors.length
    && a.gradientColors.every((color, i) => color === b.gradientColors[i])
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** Accept a stored text color: '' (follow theme) or a #rrggbb hex string. */
function normalizeColor(value: unknown): string {
  return typeof value === 'string' && (value === '' || /^#[0-9a-fA-F]{6}$/.test(value)) ? value : ''
}

/** Accept a gradient stop color: must be a #rrggbb hex string (fallback to default). */
function normalizeGradientColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback
}

/** Coerce a parsed gradient color list to exactly {@link GRADIENT_STOP_COUNT} hex colors. */
function normalizeGradientColors(value: unknown): string[] {
  const out: string[] = []
  if (Array.isArray(value)) {
    for (const item of value) {
      if (out.length >= GRADIENT_STOP_COUNT) break
      const color = normalizeGradientColor(item, '')
      if (color !== '') out.push(color)
    }
  }
  while (out.length < GRADIENT_STOP_COUNT) {
    out.push(DEFAULT_GRADIENT_COLORS[out.length] ?? '#ffffff')
  }
  return out
}

function normalizeSource(source: unknown): SourceRef | null {
  if (typeof source !== 'object' || source === null) return null
  const ref = source as SourceRef
  if (ref.kind !== 'data' && ref.kind !== 'blob') return null
  if (typeof ref.name !== 'string' || typeof ref.mime !== 'string') return null
  if (typeof ref.size !== 'number' || !Number.isFinite(ref.size)) return null
  if (ref.kind === 'data') {
    if (typeof ref.dataUrl !== 'string') return null
    return { kind: 'data', name: ref.name, mime: ref.mime, size: ref.size, dataUrl: ref.dataUrl }
  }
  if (typeof ref.id !== 'string') return null
  return { kind: 'blob', name: ref.name, mime: ref.mime, size: ref.size, id: ref.id }
}

/** Sanitize an untrusted parsed wallpaper document (older versions, hand-edited storage). */
function normalize(parsed: unknown): WallpaperSettings {
  if (typeof parsed !== 'object' || parsed === null) return cloneSettings(DEFAULT_SETTINGS)
  const value = parsed as Partial<WallpaperSettings>
  return {
    enabled: value.enabled === true,
    type: TYPES.includes(value.type as WallpaperType) ? value.type as WallpaperType : DEFAULT_SETTINGS.type,
    opacity: clamp(value.opacity, 0, 100, DEFAULT_SETTINGS.opacity),
    blur: clamp(value.blur, 0, 20, DEFAULT_SETTINGS.blur),
    speed: clamp(value.speed, 0.5, 2, DEFAULT_SETTINGS.speed),
    images: Array.isArray(value.images)
      ? value.images.map(normalizeSource).filter((ref): ref is SourceRef => ref !== null)
      : [],
    source: normalizeSource(value.source),
    rotate: value.rotate === true,
    rotateInterval: clamp(value.rotateInterval, 1, 120, DEFAULT_SETTINGS.rotateInterval),
    rotateOrder: ORDERS.includes(value.rotateOrder as RotateOrder)
      ? value.rotateOrder as RotateOrder
      : DEFAULT_SETTINGS.rotateOrder,
    fullscreen: value.fullscreen !== false,
  }
}

/** Sanitize an untrusted parsed font document. */
function normalizeFont(parsed: unknown): FontSettings {
  if (typeof parsed !== 'object' || parsed === null) return cloneFont(DEFAULT_FONT)
  const value = parsed as Partial<FontSettings>
  return {
    zoom: clamp(value.zoom, 80, 150, DEFAULT_FONT.zoom),
    textColor: normalizeColor(value.textColor),
    textSecondaryColor: normalizeColor(value.textSecondaryColor),
    gradientText: value.gradientText === true,
    gradientColors: normalizeGradientColors(value.gradientColors),
    gradientDirection: DIRECTIONS.includes(value.gradientDirection as GradientDirection)
      ? value.gradientDirection as GradientDirection
      : DEFAULT_FONT.gradientDirection,
  }
}

/** Merge a partial patch into a wallpaper document with the same clamping/validation as normalize. */
function mergeSettings(base: WallpaperSettings, patch: Partial<WallpaperSettings>): WallpaperSettings {
  return {
    enabled: patch.enabled ?? base.enabled,
    type: TYPES.includes(patch.type as WallpaperType) ? patch.type as WallpaperType : base.type,
    opacity: clamp(patch.opacity ?? base.opacity, 0, 100, base.opacity),
    blur: clamp(patch.blur ?? base.blur, 0, 20, base.blur),
    speed: clamp(patch.speed ?? base.speed, 0.5, 2, base.speed),
    images: patch.images ?? base.images,
    source: patch.source === undefined ? base.source : patch.source,
    rotate: patch.rotate ?? base.rotate,
    rotateInterval: clamp(patch.rotateInterval ?? base.rotateInterval, 1, 120, base.rotateInterval),
    rotateOrder: ORDERS.includes(patch.rotateOrder as RotateOrder)
      ? patch.rotateOrder as RotateOrder
      : base.rotateOrder,
    fullscreen: patch.fullscreen ?? base.fullscreen,
  }
}

/** Merge a partial patch into a font document. */
function mergeFont(base: FontSettings, patch: Partial<FontSettings>): FontSettings {
  return {
    zoom: clamp(patch.zoom ?? base.zoom, 80, 150, base.zoom),
    textColor: patch.textColor === undefined ? base.textColor : normalizeColor(patch.textColor),
    textSecondaryColor: patch.textSecondaryColor === undefined
      ? base.textSecondaryColor
      : normalizeColor(patch.textSecondaryColor),
    gradientText: patch.gradientText ?? base.gradientText,
    gradientColors: patch.gradientColors ?? base.gradientColors,
    gradientDirection: DIRECTIONS.includes(patch.gradientDirection as GradientDirection)
      ? patch.gradientDirection as GradientDirection
      : base.gradientDirection,
  }
}

/** Copy a wallpaper document with fresh array members. */
function cloneSettings(settings: WallpaperSettings): WallpaperSettings {
  return { ...settings, images: [...settings.images] }
}

/** Copy a font document with a fresh color array. */
function cloneFont(settings: FontSettings): FontSettings {
  return { ...settings, gradientColors: [...settings.gradientColors] }
}

/** Extract the font-ish fields from a pre-split wallpaper document (one-time migration). */
function extractFont(parsed: unknown): unknown {
  if (typeof parsed !== 'object' || parsed === null) return undefined
  const value = parsed as Record<string, unknown>
  if (value.textColor === undefined && value.gradientText === undefined) return undefined
  return {
    textColor: value.textColor,
    textSecondaryColor: value.textSecondaryColor,
    gradientText: value.gradientText,
    gradientColors: value.gradientColors,
    gradientDirection: value.gradientDirection,
  }
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `wp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(String(reader.result)) }
    reader.onerror = () => { reject(reader.error ?? new Error('file read failed')) }
    reader.readAsDataURL(file)
  })
}

/**
 * Owns the staged wallpaper and font settings pairs, the blob-payload
 * lifecycle, and the observable the settings rows and the wallpaper layer all
 * subscribe to.
 */
export class WallpaperController {
  private snapshot: WallpaperSnapshot
  private readonly listeners = new Set<() => void>()
  /** blobId → object URL; entries live as long as the referenced blob is current. */
  private readonly urlCache = new Map<string, string>()

  constructor() {
    const wallpaperRaw = readStored(STORAGE_KEY)
    const applied = normalize(wallpaperRaw)
    const fontRaw = readStored(FONT_STORAGE_KEY) ?? extractFont(wallpaperRaw)
    const fontApplied = normalizeFont(fontRaw)
    this.snapshot = Object.freeze({
      draft: cloneSettings(applied),
      applied,
      font: Object.freeze({ draft: cloneFont(fontApplied), applied: fontApplied }),
      error: null,
    })
  }

  /** Framework-injectable observable over the immutable snapshot. */
  readonly observable: HostObservable<WallpaperSnapshot> = {
    getSnapshot: () => this.snapshot,
    subscribe: (listener) => {
      this.listeners.add(listener)
      return () => { this.listeners.delete(listener) }
    },
  }

  /** The applied (live) wallpaper settings the layer renders. */
  getApplied(): WallpaperSettings {
    return this.snapshot.applied
  }

  /** The applied (live) font settings the app renders. */
  getFontApplied(): FontSettings {
    return this.snapshot.font.applied
  }

  /**
   * Stage a partial wallpaper change into the draft (nothing is applied or
   * persisted until {@link applyDraft}).
   * @param patch - the fields to change.
   */
  setDraft(patch: Partial<WallpaperSettings>): void {
    this.publish({ ...this.snapshot, draft: mergeSettings(this.snapshot.draft, patch) })
  }

  /**
   * Immediately toggle the wallpaper master switch. Turning the wallpaper OFF
   * discards the whole wallpaper configuration (sources, type, rotation,
   * opacity/blur/speed) and prunes every stored blob — the next enable starts
   * completely fresh, requiring a new upload. Turning it ON just flips the
   * flag on the (now empty) applied settings. Draft and applied stay in sync
   * on the enabled field so it never counts as an unapplied change.
   * @param enabled - the new switch state.
   */
  setEnabled(enabled: boolean): void {
    const current = this.snapshot.applied.enabled
    if (!enabled) {
      const empty = { ...cloneSettings(DEFAULT_SETTINGS), enabled: false }
      const oldIds = new Set<string>()
      for (const id of this.blobIds(this.snapshot.applied)) oldIds.add(id)
      for (const id of this.blobIds(this.snapshot.draft)) oldIds.add(id)
      persist(STORAGE_KEY, empty)
      for (const id of oldIds) this.releaseBlob(id)
      this.publish({ ...this.snapshot, draft: cloneSettings(empty), applied: empty })
      return
    }
    if (current) return // already on
    const nextApplied = { ...this.snapshot.applied, enabled: true }
    persist(STORAGE_KEY, nextApplied)
    this.publish({ ...this.snapshot, draft: { ...this.snapshot.draft, enabled: true }, applied: nextApplied })
  }

  /**
   * Promote the wallpaper draft to applied: persist it, prune blobs no longer
   * referenced, and reset the draft to the new applied state.
   */
  applyDraft(): void {
    const { draft, applied } = this.snapshot
    if (settingsEqual(draft, applied)) return
    const keep = this.blobIds(draft)
    const orphaned = new Set<string>()
    for (const id of this.blobIds(applied)) orphaned.add(id)
    for (const id of this.blobIds(draft)) orphaned.add(id)
    const nextApplied = cloneSettings(draft)
    persist(STORAGE_KEY, nextApplied)
    for (const id of orphaned) {
      if (!keep.has(id)) this.releaseBlob(id)
    }
    this.publish({ ...this.snapshot, draft: cloneSettings(nextApplied), applied: nextApplied })
  }

  /**
   * Stage a partial font change into the font draft (nothing is applied or
   * persisted until {@link applyFontDraft}).
   * @param patch - the fields to change.
   */
  setFontDraft(patch: Partial<FontSettings>): void {
    this.publish({
      ...this.snapshot,
      font: Object.freeze({ ...this.snapshot.font, draft: mergeFont(this.snapshot.font.draft, patch) }),
    })
  }

  /** Promote the font draft to applied and persist it. */
  applyFontDraft(): void {
    const { draft, applied } = this.snapshot.font
    if (fontSettingsEqual(draft, applied)) return
    const nextApplied = cloneFont(draft)
    persist(FONT_STORAGE_KEY, nextApplied)
    this.publish({
      ...this.snapshot,
      font: Object.freeze({ draft: cloneFont(nextApplied), applied: nextApplied }),
    })
  }

  /** Stage one gradient stop color in the font draft. */
  setGradientColor(index: number, color: string): void {
    const colors = [...this.snapshot.font.draft.gradientColors]
    if (index < 0 || index >= colors.length) return
    colors[index] = normalizeGradientColor(color, colors[index] ?? '#ffffff')
    this.setFontDraft({ gradientColors: colors })
  }

  /** Surface a wallpaper media failure to the settings row (no-op when already shown). */
  reportError(code: MediaErrorCode): void {
    if (this.snapshot.error === code) return
    this.publish({ ...this.snapshot, error: code })
  }

  /** Clear a surfaced wallpaper media failure (no-op when none is shown). */
  clearError(): void {
    if (this.snapshot.error === null) return
    this.publish({ ...this.snapshot, error: null })
  }

  /** Stage one more image into the draft slideshow list. */
  async addImage(file: File): Promise<void> {
    const ref = await this.storeFile(file)
    const draft = { ...this.snapshot.draft, images: [...this.snapshot.draft.images, ref] }
    this.publish({ ...this.snapshot, draft })
  }

  /** Stage removal of one draft slideshow image. */
  removeImage(index: number): void {
    const images = this.snapshot.draft.images
    if (index < 0 || index >= images.length) return
    this.publish({
      ...this.snapshot,
      draft: { ...this.snapshot.draft, images: images.filter((_, i) => i !== index) },
    })
  }

  /** Stage a reorder of one draft slideshow image (delta -1 / +1). */
  moveImage(index: number, delta: number): void {
    const images = [...this.snapshot.draft.images]
    const target = index + delta
    const current = images[index]
    const neighbour = images[target]
    if (current === undefined || neighbour === undefined) return
    images[index] = neighbour
    images[target] = current
    this.publish({ ...this.snapshot, draft: { ...this.snapshot.draft, images } })
  }

  /** Stage a single GIF/video source into the draft. */
  async setSource(file: File): Promise<void> {
    const ref = await this.storeFile(file)
    this.setDraft({ source: ref })
  }

  /** Stage removal of the single GIF/video source. */
  clearSource(): void {
    this.setDraft({ source: null })
  }

  /**
   * Resolve the renderable URL of a source: data URLs pass through; blob
   * sources resolve to a cached object URL, loading the blob on first use.
   * @param source - the current (or candidate) source.
   * @returns the URL, or null when the source is empty or its blob is gone.
   */
  async resolveUrl(source: SourceRef | null): Promise<string | null> {
    if (source === null) return null
    if (source.kind === 'data') return source.dataUrl ?? null
    const id = source.id
    if (id === undefined) return null
    const cached = this.urlCache.get(id)
    if (cached !== undefined) return cached
    const blob = await getBlob(id)
    if (blob === null) return null
    const url = URL.createObjectURL(blob)
    this.urlCache.set(id, url)
    return url
  }

  /** Revoke every cached object URL (called on plugin teardown). */
  dispose(): void {
    for (const url of this.urlCache.values()) URL.revokeObjectURL(url)
    this.urlCache.clear()
    this.listeners.clear()
  }

  private publish(next: WallpaperSnapshot): void {
    this.snapshot = Object.freeze(next)
    for (const listener of [...this.listeners]) listener()
  }

  private async storeFile(file: File): Promise<SourceRef> {
    if (file.size <= INLINE_LIMIT) {
      return { kind: 'data', name: file.name, mime: file.type, size: file.size, dataUrl: await readAsDataUrl(file) }
    }
    try {
      const id = randomId()
      await putBlob(id, file)
      return { kind: 'blob', name: file.name, mime: file.type, size: file.size, id }
    } catch {
      // IndexedDB unavailable or full: fall back to an inline data URL so the
      // upload still works (persistence may hit localStorage quota).
      return { kind: 'data', name: file.name, mime: file.type, size: file.size, dataUrl: await readAsDataUrl(file) }
    }
  }

  private blobIds(settings: WallpaperSettings): Set<string> {
    const ids = new Set<string>()
    if (settings.source?.kind === 'blob' && settings.source.id !== undefined) ids.add(settings.source.id)
    for (const ref of settings.images) {
      if (ref.kind === 'blob' && ref.id !== undefined) ids.add(ref.id)
    }
    return ids
  }

  private releaseBlob(id: string): void {
    const url = this.urlCache.get(id)
    if (url !== undefined) {
      URL.revokeObjectURL(url)
      this.urlCache.delete(id)
    }
    void deleteBlob(id).catch(() => undefined)
  }
}

function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return undefined
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

function persist(key: string, settings: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(settings))
  } catch {
    // Quota / privacy-mode failures leave the in-memory state live; the
    // wallpaper still works for the current page.
  }
}
