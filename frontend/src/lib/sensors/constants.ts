// ABOUTME: Client-safe sensor constants — no sensor function imports.
// ABOUTME: Separated from the registry so client components can import without pulling in Node.js-only deps.
import type { ConfigSettings } from '../models'

/** Maps sensor names to the config token field they require. Sensors not listed need no key. */
export const SENSOR_TOKEN_FIELD: Partial<Record<string, keyof ConfigSettings>> = {
  github: 'github_token',
  product_hunt: 'producthunt_token',
}
