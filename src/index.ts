/**
 * Node half of the dynamic-wallpaper plugin. The browser surface does all the
 * work; this half exists so the Loader row activates — client-modules only
 * serves the client bundle of a live, enabled entry — without touching the
 * host at all.
 */

/** Cordis plugin name (diagnostics). */
export const name = 'dsh-dynamic-wallpaper'

/** No host-side behavior: the wallpaper lives entirely in the browser. */
export function apply(): void {
  // Intentionally empty — see module doc.
}
