import type { PersistedState } from '../types'
import { clearPersistedState, loadPersistedState, persistState } from '../utils/storage'
import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { get, getDatabase, ref, remove, set } from 'firebase/database'

export interface CloudStorageService {
  load(): Promise<PersistedState | null>
  save(state: PersistedState): Promise<{ gistId?: string }>
  clear(): Promise<void>
}

const GITHUB_API_BASE = 'https://api.github.com'
const FIREBASE_DEFAULT_DATABASE_URL = 'https://p2p-easy-default-rtdb.firebaseio.com'
const FIREBASE_DEFAULT_DATA_PATH = 'p2p-state/current'

const cloneWithoutSecrets = (state: PersistedState): PersistedState => ({
  ...state,
  cloudSync: {
    ...state.cloudSync,
    accessToken: undefined,
    lastSyncError: undefined,
  },
})

const getFirebaseConfig = (state: PersistedState) => {
  const firebaseConfig = state.cloudSync.firebaseConfig
  const apiKey = firebaseConfig?.apiKey?.trim() ?? ''
  const authDomain = firebaseConfig?.authDomain?.trim() ?? `${firebaseConfig?.projectId?.trim() || 'p2p-easy'}.firebaseapp.com`
  const projectId = firebaseConfig?.projectId?.trim() ?? ''
  const appId = firebaseConfig?.appId?.trim() ?? ''
  const databaseURL = firebaseConfig?.databaseURL?.trim() || FIREBASE_DEFAULT_DATABASE_URL
  const storageBucket = firebaseConfig?.storageBucket?.trim()
  const messagingSenderId = firebaseConfig?.messagingSenderId?.trim()
  const measurementId = firebaseConfig?.measurementId?.trim()
  return { apiKey, authDomain, projectId, appId, databaseURL, storageBucket, messagingSenderId, measurementId }
}

const firebaseAppCache = new Map<string, FirebaseApp>()

const createFirebaseApp = (state: PersistedState) => {
  const { apiKey, authDomain, projectId, appId, databaseURL, storageBucket, messagingSenderId, measurementId } = getFirebaseConfig(state)
  if (!apiKey || !authDomain || !projectId || !appId) {
    throw new Error('Firebase configuration is incomplete.')
  }

  const existingApp = firebaseAppCache.get(projectId)
  if (existingApp) {
    return existingApp
  }

  const app = initializeApp({ apiKey, authDomain, projectId, appId, databaseURL, storageBucket, messagingSenderId, measurementId }, projectId)
  firebaseAppCache.set(projectId, app)
  return app
}

const ensureAnonymousAuth = async (app: FirebaseApp) => {
  const auth = getAuth(app)
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }
  return auth
}

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

class FirebaseRealtimeDatabaseService implements CloudStorageService {
  private readonly fallback: PersistedState

  constructor(fallback: PersistedState) {
    this.fallback = fallback
  }

  private getDocumentRef(state: PersistedState = this.fallback) {
    const app = createFirebaseApp(state)
    const database = getDatabase(app)
    return ref(database, FIREBASE_DEFAULT_DATA_PATH)
  }

  async load() {
    const app = createFirebaseApp(this.fallback)
    await ensureAnonymousAuth(app)
    const snapshot = await get(this.getDocumentRef())
    if (!snapshot.exists()) {
      return null
    }

    const payload = snapshot.val() as { state?: PersistedState } | null
    return payload?.state ? (payload.state as PersistedState) : null
  }

  async save(state: PersistedState) {
    const app = createFirebaseApp(state)
    await ensureAnonymousAuth(app)
    await set(this.getDocumentRef(state), {
      state: cloneWithoutSecrets(state),
      updatedAt: new Date().toISOString(),
    })
    return {}
  }

  async clear() {
    const app = createFirebaseApp(this.fallback)
    await ensureAnonymousAuth(app)
    await remove(this.getDocumentRef())
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
  if (provider === 'firebase') {
    return new FirebaseRealtimeDatabaseService(fallback)
  }

  if (provider === 'github-gist') {
    return new GitHubGistService(fallback)
  }

  if (provider === 'local') {
    return new LocalStorageService(fallback)
  }

  return new LocalStorageService(fallback)
}
