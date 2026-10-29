/**
 * MYMY Cloud & Local Storage + Auth Service (storage-service.js)
 * Firebase (Auth + Firestore + Storage) 및 브라우저 IndexedDB 하이브리드 저장소
 */

class MymyStorageService {
  constructor() {
    this.dbName = 'MymyCassettePlayerDB';
    this.storeName = 'tracks';
    this.localDb = null;
    this.firebaseApp = null;
    this.firestore = null;
    this.storage = null;
    this.auth = null;
    this.isFirebaseConnected = false;
    this.firebaseError = null;
    this.collectionName = 'mymy_tracks';
    this.currentUser = null;
  }

  async init() {
    this.ensureDefaultLocalAccount();
    this.restoreLocalSession();
    await this.initIndexedDB();
    await this.tryInitFirebase();
  }

  /**
   * 초기 기본 로컬 계정 준비 (아이디: admin / 비밀번호: 1234)
   * 사용자가 새 계정을 등록하면 함께 저장됩니다.
   */
  ensureDefaultLocalAccount() {
    try {
      const raw = localStorage.getItem('mymy_local_users');
      let users = raw ? JSON.parse(raw) : {};
      if (!users || typeof users !== 'object' || Object.keys(users).length === 0) {
        users = {
          admin: {
            id: 'admin',
            passwordHash: this.simpleHash('1234'),
            createdAt: Date.now()
          }
        };
        localStorage.setItem('mymy_local_users', JSON.stringify(users));
      }
    } catch (e) {
      console.warn('로컬 계정 초기화 실패:', e);
    }
  }

  simpleHash(str) {
    let h = 2166136261;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  restoreLocalSession() {
    try {
      const savedSession = sessionStorage.getItem('mymy_logged_in_user') || localStorage.getItem('mymy_logged_in_user');
      if (savedSession) {
        this.currentUser = JSON.parse(savedSession);
      }
    } catch (e) {
      this.currentUser = null;
    }
  }

  /**
   * 아이디를 Firebase Email 포맷으로 변환 (일반 아이디 입력 시 @mymy.player 도메인 자동 부여)
   */
  idToEmail(userId) {
    const trimmed = String(userId || '').trim();
    if (trimmed.includes('@')) return trimmed;
    return `${trimmed}@mymy.player`;
  }

  /**
   * 로그인 수행 (Firebase Auth 연동 시 Firebase 우선 검증 + 로컬 계정 지원)
   */
  async login(userId, password) {
    const cleanId = String(userId || '').trim();
    const cleanPw = String(password || '');

    if (!cleanId || !cleanPw) {
      throw new Error('아이디와 비밀번호를 모두 입력해 주세요.');
    }

    // 1. Firebase Auth 연결 시 Firebase 로그인 시도
    if (this.isFirebaseConnected && this.auth) {
      try {
        const email = this.idToEmail(cleanId);
        const cred = await this.auth.signInWithEmailAndPassword(email, cleanPw);
        const userObj = {
          id: cleanId,
          uid: cred.user.uid,
          email: cred.user.email,
          provider: 'firebase'
        };
        this.currentUser = userObj;
        localStorage.setItem('mymy_logged_in_user', JSON.stringify(userObj));
        return userObj;
      } catch (fbErr) {
        // Firebase에 아직 등록되지 않은 경우 로컬 계정 확인으로 폴백하되, 로컬에도 없으면 안내
        console.warn('Firebase Auth 로그인 확인:', fbErr.message);
      }
    }

    // 2. 로컬 등록 계정 검증
    const raw = localStorage.getItem('mymy_local_users');
    const users = raw ? JSON.parse(raw) : {};
    const target = users[cleanId];

    if (!target || target.passwordHash !== this.simpleHash(cleanPw)) {
      throw new Error('아이디 또는 비밀번호가 일치하지 않습니다. (기본 계정: admin / 1234 또는 [계정등록] 이용)');
    }

    const userObj = {
      id: cleanId,
      uid: `local_${cleanId}`,
      provider: 'local'
    };
    this.currentUser = userObj;
    localStorage.setItem('mymy_logged_in_user', JSON.stringify(userObj));
    return userObj;
  }

  /**
   * 신규 아이디/비밀번호 계정 등록 (Firebase Auth + 로컬 동시 등록)
   */
  async register(userId, password) {
    const cleanId = String(userId || '').trim();
    const cleanPw = String(password || '');

    if (!cleanId || !cleanPw) {
      throw new Error('등록할 아이디와 비밀번호를 입력해 주세요.');
    }
    if (cleanId.length < 2) {
      throw new Error('아이디는 2글자 이상 입력해 주세요.');
    }
    if (cleanPw.length < 4) {
      throw new Error('비밀번호는 4자리 이상 입력해 주세요.');
    }

    // 1. Firebase Auth가 활성화된 경우 Firebase에도 계정 생성 (Firebase는 6자리 이상 비밀번호 권장)
    if (this.isFirebaseConnected && this.auth && cleanPw.length >= 6) {
      try {
        const email = this.idToEmail(cleanId);
        await this.auth.createUserWithEmailAndPassword(email, cleanPw);
      } catch (fbErr) {
        console.warn('Firebase 계정 생성 참고:', fbErr.message);
      }
    }

    // 2. 로컬 계정 저장소에 등록 및 즉시 로그인 처리
    const raw = localStorage.getItem('mymy_local_users');
    const users = raw ? JSON.parse(raw) : {};
    users[cleanId] = {
      id: cleanId,
      passwordHash: this.simpleHash(cleanPw),
      createdAt: Date.now()
    };
    localStorage.setItem('mymy_local_users', JSON.stringify(users));

    const userObj = {
      id: cleanId,
      uid: `local_${cleanId}`,
      provider: this.isFirebaseConnected ? 'firebase+local' : 'local'
    };
    this.currentUser = userObj;
    localStorage.setItem('mymy_logged_in_user', JSON.stringify(userObj));
    return userObj;
  }

  /**
   * 로그아웃
   */
  async logout() {
    if (this.isFirebaseConnected && this.auth) {
      try {
        await this.auth.signOut();
      } catch (e) {
        // ignore
      }
    }
    this.currentUser = null;
    localStorage.removeItem('mymy_logged_in_user');
    sessionStorage.removeItem('mymy_logged_in_user');
  }

  isLoggedIn() {
    return Boolean(this.currentUser && this.currentUser.id);
  }

  /**
   * 로컬 IndexedDB 초기화 (오프라인 및 즉시 사용 보장)
   */
  initIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
      request.onsuccess = (event) => {
        this.localDb = event.target.result;
        resolve();
      };
      request.onerror = (event) => {
        console.error('IndexedDB 초기화 오류:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * 저장된 Firebase 설정 또는 firebase-config.js를 읽어 Firebase SDK 초기화
   */
  async tryInitFirebase() {
    const config = this.getActiveFirebaseConfig();
    if (!config || !config.apiKey || !config.projectId) {
      this.isFirebaseConnected = false;
      return false;
    }

    try {
      if (!window.firebase) {
        this.isFirebaseConnected = false;
        return false;
      }

      if (!window.firebase.apps.length) {
        this.firebaseApp = window.firebase.initializeApp(config);
      } else {
        this.firebaseApp = window.firebase.app();
      }

      this.firestore = window.firebase.firestore();
      this.storage = window.firebase.storage();
      if (window.firebase.auth) {
        this.auth = window.firebase.auth();
      }
      this.isFirebaseConnected = true;
      this.firebaseError = null;
      return true;
    } catch (err) {
      console.warn('Firebase 연결 실패 (로컬 저장소 모드로 동작합니다):', err);
      this.isFirebaseConnected = false;
      this.firebaseError = err.message;
      return false;
    }
  }

  getActiveFirebaseConfig() {
    try {
      const saved = localStorage.getItem('mymy_firebase_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.apiKey && parsed.projectId) {
          return parsed;
        }
      }
    } catch (e) {
      // ignore parse errors
    }
    if (window.DEFAULT_FIREBASE_CONFIG && window.DEFAULT_FIREBASE_CONFIG.apiKey) {
      return window.DEFAULT_FIREBASE_CONFIG;
    }
    return null;
  }

  /**
   * 사용자가 모달에서 입력한 Firebase Config 텍스트(JSON 또는 JS 객체 문법)를 파싱 및 저장
   */
  async saveFirebaseConfigFromInput(rawText) {
    const cleaned = rawText.trim();
    if (!cleaned) {
      localStorage.removeItem('mymy_firebase_config');
      this.isFirebaseConnected = false;
      return { ok: true, mode: 'local' };
    }

    const extractField = (key) => {
      const regex = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`);
      const match = cleaned.match(regex);
      return match ? match[1].trim() : '';
    };

    const config = {
      apiKey: extractField('apiKey'),
      authDomain: extractField('authDomain'),
      projectId: extractField('projectId'),
      storageBucket: extractField('storageBucket'),
      messagingSenderId: extractField('messagingSenderId'),
      appId: extractField('appId')
    };

    if (!config.apiKey || !config.projectId) {
      throw new Error('유효한 apiKey와 projectId를 찾을 수 없습니다. Firebase 콘솔의 firebaseConfig 내용을 그대로 붙여넣어 주세요.');
    }

    localStorage.setItem('mymy_firebase_config', JSON.stringify(config));
    const connected = await this.tryInitFirebase();
    return { ok: connected, config, error: this.firebaseError };
  }

  /**
   * 전체 트랙 목록 불러오기 (Firebase 연결 시 클라우드 + 로컬 병합)
   */
  async getAllTracks() {
    const localTracks = await this.getAllLocalTracks();

    if (this.isFirebaseConnected && this.firestore) {
      try {
        const snapshot = await this.firestore
          .collection(this.collectionName)
          .orderBy('createdAt', 'asc')
          .get();

        const cloudTracks = [];
        snapshot.forEach((doc) => {
          cloudTracks.push({ id: doc.id, ...doc.data(), source: 'firebase' });
        });

        const map = new Map();
        for (const t of localTracks) {
          map.set(t.id, t);
        }
        for (const ct of cloudTracks) {
          const existingLocal = map.get(ct.id);
          map.set(ct.id, {
            ...ct,
            blob: existingLocal ? existingLocal.blob : null
          });
        }
        return Array.from(map.values()).sort((a, b) => a.createdAt - b.createdAt);
      } catch (err) {
        console.warn('Firestore 조회 오류 (로컬 트랙을 반환합니다):', err);
      }
    }

    return localTracks.sort((a, b) => a.createdAt - b.createdAt);
  }

  getAllLocalTracks() {
    return new Promise((resolve, reject) => {
      if (!this.localDb) return resolve([]);
      const tx = this.localDb.transaction(this.storeName, 'readonly');
      const store = tx.objectStore(this.storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 최적화된 오디오 트랙 저장 (IndexedDB + Firebase Storage/Firestore 동시 저장)
   */
  async addTrack(trackData, onUploadProgress = () => {}) {
    const id = trackData.id || `track_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const record = {
      id,
      title: trackData.title,
      fileName: trackData.fileName,
      mimeType: trackData.mimeType || 'audio/mpeg',
      duration: trackData.duration || 0,
      originalSize: trackData.originalSize || 0,
      compressedSize: trackData.compressedSize || 0,
      savedPercent: trackData.savedPercent || 0,
      bitrateKbps: trackData.bitrateKbps || 128,
      method: trackData.method || '최적화 저장',
      selected: trackData.selected !== undefined ? trackData.selected : true,
      ownerId: this.currentUser ? this.currentUser.id : 'admin',
      createdAt: Date.now(),
      downloadURL: null,
      storagePath: null,
      blob: trackData.blob
    };

    await this.putLocalTrack(record);

    if (this.isFirebaseConnected && this.storage && this.firestore) {
      try {
        const safeName = record.fileName.replace(/[^a-zA-Z0-9._-가-힣]/g, '_');
        const storagePath = `mymy_tracks/${id}_${safeName}`;
        const storageRef = this.storage.ref().child(storagePath);

        const uploadTask = storageRef.put(record.blob, {
          contentType: record.mimeType
        });

        await new Promise((resolve, reject) => {
          uploadTask.on(
            'state_changed',
            (snapshot) => {
              const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
              onUploadProgress(pct, `Firebase Cloud 업로드 중 (${pct}%)...`);
            },
            (err) => reject(err),
            () => resolve()
          );
        });

        const downloadURL = await storageRef.getDownloadURL();
        record.downloadURL = downloadURL;
        record.storagePath = storagePath;

        const firestoreDoc = {
          id: record.id,
          title: record.title,
          fileName: record.fileName,
          mimeType: record.mimeType,
          duration: record.duration,
          originalSize: record.originalSize,
          compressedSize: record.compressedSize,
          savedPercent: record.savedPercent,
          bitrateKbps: record.bitrateKbps,
          method: record.method,
          selected: record.selected,
          ownerId: record.ownerId,
          createdAt: record.createdAt,
          downloadURL: record.downloadURL,
          storagePath: record.storagePath
        };

        await this.firestore.collection(this.collectionName).doc(id).set(firestoreDoc);
        await this.putLocalTrack(record);
      } catch (err) {
        console.warn('Firebase 업로드 실패 (로컬 저장소에는 안전하게 보관됨):', err);
      }
    }

    return record;
  }

  putLocalTrack(record) {
    return new Promise((resolve, reject) => {
      if (!this.localDb) return resolve();
      const tx = this.localDb.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * REC 섹션에서 트랙 선택/해제 상태 업데이트
   */
  async updateTrackSelected(id, selected) {
    if (this.localDb) {
      const tx = this.localDb.transaction(this.storeName, 'readwrite');
      const store = tx.objectStore(this.storeName);
      const existing = await new Promise((res) => {
        const r = store.get(id);
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      });
      if (existing) {
        existing.selected = selected;
        store.put(existing);
      }
    }

    if (this.isFirebaseConnected && this.firestore) {
      try {
        await this.firestore.collection(this.collectionName).doc(id).update({ selected });
      } catch (err) {
        console.warn('Firestore 선곡 상태 업데이트 오류:', err);
      }
    }
  }

  /**
   * EJECT 섹션에서 트랙 삭제 (로컬 + Firebase Storage/Firestore 동시 삭제)
   */
  async deleteTrack(track) {
    const id = typeof track === 'string' ? track : track.id;

    if (this.localDb) {
      await new Promise((resolve) => {
        const tx = this.localDb.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      });
    }

    if (this.isFirebaseConnected && this.firestore) {
      try {
        if (track && track.storagePath && this.storage) {
          await this.storage.ref().child(track.storagePath).delete().catch(() => {});
        }
        await this.firestore.collection(this.collectionName).doc(id).delete();
      } catch (err) {
        console.warn('Firebase 트랙 삭제 오류:', err);
      }
    }
  }

  /**
   * 전체 트랙 삭제
   */
  async deleteAllTracks(tracks = []) {
    for (const t of tracks) {
      await this.deleteTrack(t);
    }
  }
}

window.MymyStorageService = MymyStorageService;
