/**
 * tsdown config for the dynamic-wallpaper plugin, built with the DSH client
 * bundle preset. Emits two halves in one run:
 *   - lib/index.js  — node half (no-op host plugin; the Loader row must
 *                     activate for client-modules to serve the client bundle)
 *   - lib/client.js — browser half (the wallpaper layer + settings row)
 *
 * The preset is imported from the DSH checkout, so this package must be built
 * from inside the checkout tree (node resolution walks up to the repo's
 * node_modules). Both halves compile from TypeScript source directly; no
 * separate tsc pass is required.
 */
import { clientBundle } from '../../packages/client/tsdown.client.ts'

export default clientBundle('dsh-dynamic-wallpaper', ['src/index.ts'])
