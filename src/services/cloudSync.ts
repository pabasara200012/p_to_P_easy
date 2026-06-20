import type { PersistedState } from '../types'
import { clearPersistedState, loadPersistedState, persistState } from '../utils/storage'

export interface CloudStorageService {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<{ gistId?: string }>
  clear(): Promise<void>
}

const GITHUB_API_BASE = 'https://api.github.com'

const cloneWithoutSecrets = (state: PersistedState): PersistedState => ({
  ...state,
  cloudSync: {
    ...state.cloudSync,
    accessToken: undefined,
    lastSyncError: undefined,
  },
})

class GitHubGistService implements CloudStorageService {
  private readonly fallback: PersistedState

  constructor(fallback: PersistedState) {
    this.fallback = fallback
  }

  private getConfig(state: PersistedState = this.fallback) {
    const token = state.cloudSync.accessToken?.trim() ?? ''
    const gistId = state.cloudSync.gistId?.trim() ?? ''
    const fileName = state.cloudSync.fileName?.trim() || 'p2p-backup.json'
    return { token, gistId, fileName }
  }

  async load() {
    const { token, gistId } = this.getConfig()
    if (!token || !gistId) {
      return null
    }

    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to load Gist: ${response.status}`)
    }

    const payload = (await response.json()) as { files?: Record<string, { content?: string }> }
    const content = Object.values(payload.files ?? {}).find((entry) => typeof entry.content === 'string')?.content
    if (!content) {
      return null
    }

    return JSON.parse(content) as PersistedState
  }

  async save(state: PersistedState) {
    const { token, gistId, fileName } = this.getConfig(state)
    if (!token) {
      throw new Error('GitHub token is missing.')
    }

    const body = JSON.stringify({
      description: 'Binance P2P Profit Tracker backup',
      public: false,
      files: {
        [fileName]: {
          content: JSON.stringify(cloneWithoutSecrets(state)),
        },
      },
    })

    const response = await fetch(gistId ? `${GITHUB_API_BASE}/gists/${gistId}` : `${GITHUB_API_BASE}/gists`, {
      method: gistId ? 'PATCH' : 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`Failed to save Gist: ${response.status}`)
    }

    const payload = (await response.json()) as { id?: string }
    return { gistId: payload.id }
  }

  async clear() {
    const { token, gistId } = this.getConfig()
    if (!token || !gistId) {
      return
    }

    const response = await fetch(`${GITHUB_API_BASE}/gists/${gistId}`, {
      method: 'DELETE',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to clear Gist: ${response.status}`)
    }
  }
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
    return {}
  }

  async clear() {
    clearPersistedState()
  }
}

export const createCloudStorageService = (provider: PersistedState['cloudSync']['provider'], fallback: PersistedState): CloudStorageService => {
  if (provider === 'github-gist') {
    return new GitHubGistService(fallback)
  }

  if (provider === 'local') {
    return new LocalStorageService(fallback)
  }

  return new LocalStorageService(fallback)
}
