// Lightweight cross-screen signal. The add/edit-dress screen sets `dirty` on a
// successful save so the Catalog (and dashboard) force a refresh on next focus
// even inside their staleness window — keeping "catalog updated & visible"
// without giving up the tab-switch refetch optimization.
export const catalogSignal = { dirty: false };

export function markCatalogDirty() {
  catalogSignal.dirty = true;
}

export function consumeCatalogDirty(): boolean {
  if (catalogSignal.dirty) {
    catalogSignal.dirty = false;
    return true;
  }
  return false;
}
