import type { PersistedState } from '../types'
import { clearPersistedState, loadPersistedState, persistState } from '../utils/storage'

export interface CloudStorageService {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<void>
  clear(): Promise<void>
}

export class LocalStorageService implements CloudStorageService {
  private readonly fallback: PersistedState

  constructor(fallback: PersistedState) {
    this.fallback = fallback
  }

  async load() {
    return loadPersistedState(this.fallback)
  }

  async save(state: PersistedState) {
    persistState(state)
  }

  async clear() {
    clearPersistedState()
  }
}

export const createCloudStorageService = (provider: PersistedState['cloudSync']['provider'], fallback: PersistedState): CloudStorageService => {
  if (provider === 'local') {
    return new LocalStorageService(fallback)
  }

  return new LocalStorageService(fallback)
}
