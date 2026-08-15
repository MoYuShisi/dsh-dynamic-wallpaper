/**
 * Dynamic-wallpaper preference row registered into the General section item
 * slot (`settings.general.item`): enable switch, renderer type selector, local
 * file upload (multi-image slideshow for the image type, single GIF/video),
 * opacity / blur / speed sliders, and the staged "确定更换" (apply) button —
 * nothing takes effect until it is clicked. Text/color settings live in the
 * separate Font row of the same plugin.
 *
 * The row edits the WALLPAPER DRAFT via the injected callbacks; the wallpaper
 * layer only renders the APPLIED settings, so every change is staged until
 * applyDraft.
 */
import { useRef } from 'react'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  RotateOrder, WallpaperSettings, WallpaperSnapshot, WallpaperType,
} from './controller.ts'
import { inferType, settingsEqual } from './controller.ts'
import type { WallpaperKey } from './locales.ts'
import css from './WallpaperRow.module.css'

/** Injected business face: the snapshot observable plus the staged write paths. */
export interface WallpaperRowInjected {
  /** The controller's immutable snapshot (bound to `useConfig`). */
  hooks: { config: HostObservable<WallpaperSnapshot> }
  /** Immediately toggle the wallpaper on/off (not staged). */
  setEnabled: (enabled: boolean) => void
  /** Stage a partial wallpaper change into the draft. */
  setDraft: (patch: Partial<WallpaperSettings>) => void
  /** Promote the wallpaper draft to applied (确定更换) — persists and re-renders. */
  applyDraft: () => void
  /** Stage one more image into the draft slideshow list. */
  addImage: (file: File) => void
  removeImage: (index: number) => void
  moveImage: (index: number, delta: number) => void
  /** Stage a single GIF/video source into the draft. */
  setSource: (file: File) => void
  clearSource: () => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type WallpaperRowComponentProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.wallpaper'>
  & InjectFace<WallpaperRowInjected>

/** Selectable renderer modes in nav order. */
const TYPE_OPTIONS: readonly { id: WallpaperType; labelKey: WallpaperKey }[] = [
  { id: 'image', labelKey: 'type.image' },
  { id: 'gif', labelKey: 'type.gif' },
  { id: 'video', labelKey: 'type.video' },
]

/** Rotation order options. */
const ORDER_OPTIONS: readonly { id: RotateOrder; labelKey: WallpaperKey }[] = [
  { id: 'sequence', labelKey: 'rotate.sequence' },
  { id: 'random', labelKey: 'rotate.random' },
]

/**
 * Render the dynamic-wallpaper row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function WallpaperRow(props: WallpaperRowComponentProps) {
  const {
    t, useConfig, setEnabled, setDraft, applyDraft, addImage, removeImage, moveImage, setSource, clearSource,
  } = props
  const snapshot = useConfig(s => s)
  const { draft, applied, error } = snapshot
  const fileInput = useRef<HTMLInputElement | null>(null)
  const dirty = !settingsEqual(draft, applied)
  const speedDisabled = draft.type !== 'video'

  return (
    <div className={css.group}>
      <div className={css.header}>
        <span className={css.title}>{t('row.title')}</span>
        <button
          type="button"
          role="switch"
          aria-checked={draft.enabled}
          className={css.switch}
          data-on={draft.enabled || undefined}
          onClick={() => { setEnabled(!draft.enabled) }}
        >
          <span className={css.switchKnob} />
          <span className={css.hiddenLabel}>{t('row.enabled')}</span>
        </button>
      </div>
      <span className={css.note}>{t('row.switchNote')}</span>

      {draft.enabled && (
        <div className={css.body}>
          <div className={css.field}>
            <span className={css.fieldLabel}>{t('row.type')}</span>
            <select
              className={css.select}
              value={draft.type}
              onChange={(event) => { setDraft({ type: event.target.value as WallpaperType }) }}
            >
              {TYPE_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
              ))}
            </select>
          </div>

          <div className={css.subField}>
            <span className={css.fieldLabel}>{t('row.fullscreen')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.fullscreen}
              className={css.switch}
              data-on={draft.fullscreen || undefined}
              onClick={() => { setDraft({ fullscreen: !draft.fullscreen }) }}
            >
              <span className={css.switchKnob} />
              <span className={css.hiddenLabel}>{t('row.fullscreen')}</span>
            </button>
          </div>
          <span className={css.note}>{t('row.fullscreenNote')}</span>

          <div className={css.field}>
            <span className={css.fieldLabel}>{t('row.source')}</span>
            <div className={css.fileRow}>
              <input
                ref={fileInput}
                className={css.fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file !== undefined) {
                    // Route by file kind, independent of the selected type.
                    const kind = inferType(file.type, file.name)
                    if (kind === 'video' || kind === 'gif') setSource(file)
                    else addImage(file)
                  }
                  event.target.value = ''
                }}
              />
              <button type="button" className={css.button} onClick={() => { fileInput.current?.click() }}>
                {t('row.upload')}
              </button>
            </div>
            <span className={css.note}>{t('row.uploadHint')}</span>
          </div>

          {draft.type === 'image' && (
            <div className={css.field}>
              {draft.images.length === 0 && <span className={css.note}>{t('row.noImages')}</span>}
              <div className={css.imageList}>
                {draft.images.map((image, index) => (
                  <div key={index} className={css.imageRow}>
                    <span className={css.imageIndex}>{index + 1}</span>
                    <span className={css.fileName} title={image.name}>{image.name}</span>
                    <button
                      type="button"
                      className={css.miniButton}
                      disabled={index === 0}
                      onClick={() => { moveImage(index, -1) }}
                    >
                      {t('row.up')}
                    </button>
                    <button
                      type="button"
                      className={css.miniButton}
                      disabled={index === draft.images.length - 1}
                      onClick={() => { moveImage(index, 1) }}
                    >
                      {t('row.down')}
                    </button>
                    <button type="button" className={css.removeButton} onClick={() => { removeImage(index) }}>
                      {t('row.remove')}
                    </button>
                  </div>
                ))}
              </div>
              {draft.images.length > 1 && (
                <>
                  <div className={css.subField}>
                    <span className={css.fieldLabel}>{t('row.rotate')}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={draft.rotate}
                      className={css.switch}
                      data-on={draft.rotate || undefined}
                      onClick={() => { setDraft({ rotate: !draft.rotate }) }}
                    >
                      <span className={css.switchKnob} />
                      <span className={css.hiddenLabel}>{t('row.rotate')}</span>
                    </button>
                  </div>
                  {draft.rotate && (
                    <>
                      <div className={css.subField}>
                        <span className={css.fieldLabel}>
                          {t('row.rotateInterval')} <span className={css.value}>{draft.rotateInterval}s</span>
                        </span>
                        <input
                          className={css.range}
                          type="range"
                          min={1}
                          max={120}
                          value={draft.rotateInterval}
                          onChange={(event) => { setDraft({ rotateInterval: Number(event.target.value) }) }}
                        />
                      </div>
                      <div className={css.subField}>
                        <span className={css.fieldLabel}>{t('row.rotateOrder')}</span>
                        <select
                          className={css.select}
                          value={draft.rotateOrder}
                          onChange={(event) => { setDraft({ rotateOrder: event.target.value as RotateOrder }) }}
                        >
                          {ORDER_OPTIONS.map(option => (
                            <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {(draft.type === 'gif' || draft.type === 'video') && (
            <div className={css.field}>
              <span className={css.fieldLabel}>
                {draft.type === 'gif' ? t('type.gif') : t('type.video')}
              </span>
              <div className={css.fileRow}>
                {draft.source !== null && (
                  <>
                    <span className={css.fileName} title={draft.source.name}>{draft.source.name}</span>
                    <button type="button" className={css.removeButton} onClick={clearSource}>
                      {t('row.remove')}
                    </button>
                  </>
                )}
                {draft.source === null && <span className={css.note}>{t('row.noSource')}</span>}
              </div>
            </div>
          )}

          <div className={css.field}>
            <span className={css.fieldLabel}>
              {t('row.opacity')} <span className={css.value}>{draft.opacity}%</span>
            </span>
            <input
              className={css.range}
              type="range"
              min={0}
              max={100}
              value={draft.opacity}
              onChange={(event) => { setDraft({ opacity: Number(event.target.value) }) }}
            />
          </div>

          <div className={css.field}>
            <span className={css.fieldLabel}>
              {t('row.blur')} <span className={css.value}>{draft.blur}px</span>
            </span>
            <input
              className={css.range}
              type="range"
              min={0}
              max={20}
              value={draft.blur}
              onChange={(event) => { setDraft({ blur: Number(event.target.value) }) }}
            />
          </div>

          <div className={css.field}>
            <span className={css.fieldLabel}>
              {t('row.speed')} <span className={css.value}>{draft.speed.toFixed(1)}×</span>
            </span>
            <input
              className={css.range}
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={draft.speed}
              disabled={speedDisabled}
              onChange={(event) => { setDraft({ speed: Number(event.target.value) }) }}
            />
            <span className={css.note}>{t('row.speedNote')}</span>
          </div>

          {error !== null && (
            <span className={css.errorNote}>
              {error === 'load' ? t('row.errorLoad')
                : error === 'decode' ? t('row.errorDecode')
                  : draft.type === 'video' ? t('row.mismatchNotVideo')
                    : t('row.mismatchNotImage')}
            </span>
          )}

          <div className={css.applyRow}>
            {dirty && <span className={css.pendingNote}>{t('row.pending')}</span>}
            <button type="button" className={css.applyButton} disabled={!dirty} onClick={applyDraft}>
              {t('row.apply')}
            </button>
          </div>

          <span className={css.hint}>{t('row.hint')}</span>
        </div>
      )}
    </div>
  )
}
