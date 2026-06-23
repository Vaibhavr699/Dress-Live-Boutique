/** Moved to shared so the advisor app (boutique-app) can render the same
 * AR overlay on its copy of the buyer's remote video. Thin re-export
 * here so existing local imports keep working without churn. */
export { ARGarmentOverlay, default } from '@shared/components/ARGarmentOverlay';
export type { ARLandmark, ARTorsoLandmarks } from '@shared/components/ARGarmentOverlay';
