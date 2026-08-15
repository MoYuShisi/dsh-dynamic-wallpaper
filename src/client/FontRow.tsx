/**
 * Font preference row registered into the General section item slot
 * (`settings.general.item`) by the same plugin as the wallpaper row: UI zoom
 * (font size), solid text colors, and the 5-stop gradient text. Independent of
 * the wallpaper — the settings apply as soon as their "确定更换" button is
 * pressed, whether or not the wallpaper is enabled.
 */
import type {
  HostObservable, InjectFace, PropsLocale, PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { FontSettings, GradientDirection, WallpaperSnapshot } from './controller.ts'
import { fontSettingsEqual, GRADIENT_STOP_COUNT } from './controller.ts'
import type { WallpaperKey } from './locales.ts'
import css from './WallpaperRow.module.css'

/** Injected business face: the snapshot observable plus the staged font write paths. */
export interface FontRowInjected {
  /** The controller's immutable snapshot (bound to `useConfig`). */
  hooks: { config: HostObservable<WallpaperSnapshot> }
  /** Stage a partial font change into the font draft. */
  setFontDraft: (patch: Partial<FontSettings>) => void
  /** Promote the font draft to applied (确定更换) — persists and re-renders. */
  applyFontDraft: () => void
  /** Stage one gradient stop color in the font draft. */
  setGradientColor: (index: number, color: string) => void
}

/** Full component props: runtime share + locale seat + injected face. */
export type FontRowComponentProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'settings.wallpaper'>
  & InjectFace<FontRowInjected>

/** Gradient direction options. */
const DIRECTION_OPTIONS: readonly { id: GradientDirection; labelKey: WallpaperKey }[] = [
  { id: 'vertical', labelKey: 'gradient.vertical' },
  { id: 'horizontal', labelKey: 'gradient.horizontal' },
  { id: 'diagonal', labelKey: 'gradient.diagonal' },
]

/**
 * Render the Font row.
 * @param props - composed slot props.
 * @returns the row element tree.
 */
export function FontRow(props: FontRowComponentProps) {
  const { t, useConfig, setFontDraft, applyFontDraft, setGradientColor } = props
  const snapshot = useConfig(s => s)
  const { draft, applied } = snapshot.font
  const dirty = !fontSettingsEqual(draft, applied)
  const gradientActive = draft.gradientText

  return (
    <div className={css.group}>
      <div className={css.header}>
        <span className={css.title}>{t('font.title')}</span>
      </div>
      <div className={css.body}>
        <div className={css.field}>
          <span className={css.fieldLabel}>
            {t('font.zoom')} <span className={css.value}>{draft.zoom}%</span>
          </span>
          <input
            className={css.range}
            type="range"
            min={80}
            max={150}
            step={5}
            value={draft.zoom}
            onChange={(event) => { setFontDraft({ zoom: Number(event.target.value) }) }}
          />
          <span className={css.note}>{t('font.zoomNote')}</span>
        </div>

        <div className={css.field}>
          <span className={css.fieldLabel}>{t('font.gradientText')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={gradientActive}
            className={css.switch}
            data-on={gradientActive || undefined}
            onClick={() => { setFontDraft({ gradientText: !gradientActive }) }}
          >
            <span className={css.switchKnob} />
            <span className={css.hiddenLabel}>{t('font.gradientText')}</span>
          </button>
        </div>

        {gradientActive && (
          <>
            <div className={css.field}>
              <span className={css.fieldLabel}>{t('font.gradientDirection')}</span>
              <select
                className={css.select}
                value={draft.gradientDirection}
                onChange={(event) => { setFontDraft({ gradientDirection: event.target.value as GradientDirection }) }}
              >
                {DIRECTION_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>{t(option.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className={css.field}>
              <span className={css.fieldLabel}>{t('font.gradientColors')}</span>
              <div className={css.colorRow}>
                {draft.gradientColors.slice(0, GRADIENT_STOP_COUNT).map((color, index) => (
                  <input
                    key={index}
                    className={css.colorInput}
                    type="color"
                    title={color}
                    value={color}
                    onChange={(event) => { setGradientColor(index, event.target.value) }}
                  />
                ))}
              </div>
              <span className={css.note}>{t('font.gradientNote')}</span>
            </div>
          </>
        )}

        {!gradientActive && (
          <>
            <div className={css.field}>
              <span className={css.fieldLabel}>{t('font.textColor')}</span>
              <div className={css.colorRow}>
                <input
                  className={css.colorInput}
                  type="color"
                  value={draft.textColor || '#ffffff'}
                  onChange={(event) => { setFontDraft({ textColor: event.target.value }) }}
                />
                <button type="button" className={css.resetButton} onClick={() => { setFontDraft({ textColor: '' }) }}>
                  {t('font.reset')}
                </button>
              </div>
            </div>
            <div className={css.field}>
              <span className={css.fieldLabel}>{t('font.textSecondaryColor')}</span>
              <div className={css.colorRow}>
                <input
                  className={css.colorInput}
                  type="color"
                  value={draft.textSecondaryColor || '#ffffff'}
                  onChange={(event) => { setFontDraft({ textSecondaryColor: event.target.value }) }}
                />
                <button
                  type="button"
                  className={css.resetButton}
                  onClick={() => { setFontDraft({ textSecondaryColor: '' }) }}
                >
                  {t('font.reset')}
                </button>
              </div>
            </div>
            <span className={css.note}>{t('font.colorNote')}</span>
          </>
        )}

        <div className={css.applyRow}>
          {dirty && <span className={css.pendingNote}>{t('font.pending')}</span>}
          <button type="button" className={css.applyButton} disabled={!dirty} onClick={applyFontDraft}>
            {t('font.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
