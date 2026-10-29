/**
 * SAMSUNG mymy (MY-F65) Minimalist Retro Cassette Player Controller (app.js)
 * 중복 UI 제거 · 이미지 물리 버튼 단일 메뉴 · 우측 상단 로그인 전용
 */

class MymyPlayerApp {
  constructor() {
    this.storage = new MymyStorageService();
    this.audio = document.getElementById('mainAudioElement');
    this.tracks = [];
    this.currentTrackId = null;
    this.loadedTrackId = null;
    this.currentObjectUrl = null;
    this.isPlaying = false;
    this.playbackState = 'READY';
    this.volume = 0.8;
    this.isMuted = false;
    this.toastTimer = null;
    this.sfxCtx = null;
  }

  async init() {
    this.bindAudioEvents();
    this.bindUIEvents();
    this.setVolume(80, false, true);

    await this.storage.init();
    this.updateCloudBadge();
    this.updateAuthUI();
    await this.refreshTrackList();

    if (this.tracks.length === 0 && !localStorage.getItem('mymy_samples_cleared')) {
      await this.addSampleTracks(true);
    }
  }

  /**
   * 로그인 확인 가드 (로그인한 사용자만 사용 가능)
   */
  requireAuth() {
    if (this.storage.isLoggedIn()) return true;

    this.playMechanicalClick('locked');
    this.showToast('🔒 오른쪽 상단에서 로그인 후 사용할 수 있습니다. (기본: admin / 1234)');

    const authMenu = document.getElementById('topRightAuthMenu');
    const idInput = document.getElementById('authUserIdInput');
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (authMenu) {
      authMenu.classList.add('highlight-pulse');
      setTimeout(() => authMenu.classList.remove('highlight-pulse'), 1200);
    }
    if (idInput) {
      setTimeout(() => idInput.focus(), 200);
    }
    return false;
  }

  async handleLoginSubmit(event) {
    if (event) event.preventDefault();
    const idInput = document.getElementById('authUserIdInput');
    const pwInput = document.getElementById('authPasswordInput');
    const userId = idInput ? idInput.value.trim() : '';
    const password = pwInput ? pwInput.value : '';

    try {
      const user = await this.storage.login(userId, password);
      if (pwInput) pwInput.value = '';
      this.playMechanicalClick('play');
      this.updateAuthUI();
      await this.refreshTrackList();
      this.showToast(`🔓 ${user.id}님 로그인되었습니다.`);
    } catch (err) {
      this.playMechanicalClick('locked');
      this.showToast(`⚠️ ${err.message}`);
    }
  }

  async handleRegisterClick() {
    const idInput = document.getElementById('authUserIdInput');
    const pwInput = document.getElementById('authPasswordInput');
    const userId = idInput ? idInput.value.trim() : '';
    const password = pwInput ? pwInput.value : '';

    if (!userId || !password) {
      this.showToast('아이디와 비밀번호(4자리 이상)를 입력한 뒤 [등록]을 눌러주세요.');
      if (idInput) idInput.focus();
      return;
    }

    try {
      const user = await this.storage.register(userId, password);
      if (pwInput) pwInput.value = '';
      this.playMechanicalClick('play');
      this.updateAuthUI();
      await this.refreshTrackList();
      this.showToast(`✨ '${user.id}' 계정이 등록 및 로그인되었습니다.`);
    } catch (err) {
      this.playMechanicalClick('locked');
      this.showToast(`⚠️ ${err.message}`);
    }
  }

  async handleLogout() {
    this.stopPlayback(true);
    await this.storage.logout();
    this.updateAuthUI();
    this.renderAllLists();
    this.updatePlaybackIndicators();
    this.showToast('🔒 로그아웃되었습니다.');
  }

  updateAuthUI() {
    const loggedIn = this.storage.isLoggedIn();
    const formEl = document.getElementById('authLoggedOutForm');
    const loggedInBox = document.getElementById('authLoggedInBox');
    const userIdSpan = document.getElementById('loggedInUserId');

    document.body.classList.toggle('is-locked', !loggedIn);

    if (loggedIn) {
      if (formEl) formEl.classList.add('hidden');
      if (loggedInBox) loggedInBox.classList.remove('hidden');
      if (userIdSpan && this.storage.currentUser) {
        userIdSpan.textContent = this.storage.currentUser.id;
      }
    } else {
      if (formEl) formEl.classList.remove('hidden');
      if (loggedInBox) loggedInBox.classList.add('hidden');
    }
  }

  playMechanicalClick(type = 'button') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.sfxCtx || this.sfxCtx.state === 'closed') {
        this.sfxCtx = new AudioCtx();
      }
      if (this.sfxCtx.state === 'suspended') {
        this.sfxCtx.resume().catch(() => {});
      }

      const ctx = this.sfxCtx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type === 'locked' ? 'sawtooth' : type === 'stop' ? 'square' : 'triangle';
      const baseFreq =
        type === 'locked' ? 110 : type === 'rec' ? 210 : type === 'stop' ? 140 : 175;
      osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.045);

      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.055);
    } catch (e) {
      // ignore
    }
  }

  bindAudioEvents() {
    this.audio.addEventListener('timeupdate', () => {
      const cur = this.audio.currentTime || 0;
      const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      const pct = dur > 0 ? (cur / dur) * 100 : 0;

      const seekSlider = document.getElementById('seekSlider');
      if (seekSlider && !seekSlider.dataset.dragging) {
        seekSlider.value = pct;
      }

      document.getElementById('heroTimeCurrent').textContent = this.formatTime(cur);
      document.getElementById('heroTimeTotal').textContent = this.formatTime(dur);
    });

    this.audio.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      document.getElementById('heroTimeTotal').textContent = this.formatTime(dur);
    });

    this.audio.addEventListener('play', () => {
      this.isPlaying = true;
      this.playbackState = 'PLAY';
      document.body.classList.add('is-playing');
      this.renderAllLists();
      this.updatePlaybackIndicators();
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
      if (this.playbackState !== 'STOP' && this.playbackState !== 'READY') {
        this.playbackState = 'PAUSE';
      }
      document.body.classList.remove('is-playing');
      this.renderAllLists();
      this.updatePlaybackIndicators();
    });

    this.audio.addEventListener('ended', () => {
      this.nextTrack(true);
    });
  }

  bindUIEvents() {
    // 1. 볼륨 슬라이더 & 마우스 휠 조작
    const masterVol = document.getElementById('masterVolumeSlider');
    if (masterVol) {
      masterVol.addEventListener('input', (e) => {
        if (!this.requireAuth()) {
          e.target.value = Math.round(this.volume * 100);
          return;
        }
        this.setVolume(Number(e.target.value));
      });
    }

    const hsVolume = document.getElementById('hsVolume');
    if (hsVolume) {
      hsVolume.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          if (!this.requireAuth()) return;
          const delta = e.deltaY < 0 ? 5 : -5;
          this.setVolume(Math.round(this.volume * 100) + delta, true);
        },
        { passive: false }
      );
    }

    // 2. 시크바 조작
    const seekSlider = document.getElementById('seekSlider');
    if (seekSlider) {
      seekSlider.addEventListener('mousedown', () => { seekSlider.dataset.dragging = '1'; });
      seekSlider.addEventListener('touchstart', () => { seekSlider.dataset.dragging = '1'; });
      seekSlider.addEventListener('change', (e) => {
        delete seekSlider.dataset.dragging;
        if (!this.requireAuth()) {
          e.target.value = 0;
          return;
        }
        if (Number.isFinite(this.audio.duration) && this.audio.duration > 0) {
          this.audio.currentTime = (Number(e.target.value) / 100) * this.audio.duration;
        }
      });
    }

    // 3. EJECT 파일 업로드 & 드래그앤드롭
    const fileInput = document.getElementById('audioFileInput');
    if (fileInput) {
      fileInput.addEventListener('click', (e) => {
        if (!this.requireAuth()) e.preventDefault();
      });
      fileInput.addEventListener('change', (e) => {
        if (!this.requireAuth()) {
          fileInput.value = '';
          return;
        }
        if (e.target.files && e.target.files.length > 0) {
          this.handleFilesUpload(Array.from(e.target.files));
          fileInput.value = '';
        }
      });
    }

    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (this.storage.isLoggedIn()) dropZone.classList.add('dragover');
      });
      dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (!this.requireAuth()) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFilesUpload(Array.from(e.dataTransfer.files));
        }
      });
    }
  }

  /**
   * 마이마이 이미지 위의 물리 버튼 동작 (방식 A)
   */
  handleHeroButton(action) {
    if (!this.requireAuth()) return;
    this.playMechanicalClick(action);

    switch (action) {
      case 'play':
        this.togglePlaySelected();
        break;
      case 'stop':
        this.stopPlayback(false);
        break;
      case 'rec':
        this.scrollToSection('section-rec', true);
        break;
      case 'eject':
        this.scrollToSection('section-eject', true);
        break;
      case 'rew':
        this.prevTrack();
        break;
      case 'ff':
        this.nextTrack();
        break;
      default:
        break;
    }
  }

  scrollToSection(sectionId, skipAuthCheck = false) {
    if (!skipAuthCheck && sectionId !== 'section-hero' && !this.requireAuth()) return;
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleVolumePopover() {
    if (!this.requireAuth()) return;
    this.playMechanicalClick('button');
    const pop = document.getElementById('volumePopover');
    if (pop) pop.classList.toggle('hidden');
  }

  setVolume(percent, notify = false, skipAuth = false) {
    if (!skipAuth && !this.requireAuth()) return;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.volume = clamped / 100;
    this.isMuted = clamped === 0;
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    const masterVol = document.getElementById('masterVolumeSlider');
    if (masterVol) masterVol.value = clamped;

    const volLabel = document.getElementById('volumeValueLabel');
    if (volLabel) volLabel.textContent = `${clamped}%`;

    const muteBtn = document.getElementById('muteBtn');
    const icon = clamped === 0 ? '🔇' : clamped < 45 ? '🔉' : '🔊';
    if (muteBtn) muteBtn.textContent = icon;

    if (notify) this.showToast(`${icon} 볼륨 ${clamped}%`);
  }

  toggleMute() {
    if (!this.requireAuth()) return;
    if (this.isMuted || this.volume === 0) {
      this.setVolume(this.lastNonZeroVolume || 80, true);
    } else {
      this.lastNonZeroVolume = Math.round(this.volume * 100);
      this.setVolume(0, true);
    }
  }

  getSelectedTracks() {
    return this.tracks.filter((t) => t.selected);
  }

  /**
   * PLAY 버튼: 선택된(REC) 곡들만 재생 / 일시정지
   */
  async togglePlaySelected() {
    if (!this.requireAuth()) return;

    if (this.tracks.length === 0) {
      this.showToast('🎵 기본 카세트 샘플 음원을 준비하여 재생합니다...');
      await this.addSampleTracks(true);
    }

    const selected = this.getSelectedTracks();
    if (selected.length === 0) {
      this.showToast('REC에서 재생할 음악을 선택해 주세요.');
      this.scrollToSection('section-rec', true);
      return;
    }

    const activeInSelected = selected.find((t) => t.id === this.currentTrackId) || selected[0];
    const isTrackLoaded =
      this.loadedTrackId === activeInSelected.id &&
      Boolean(this.audio.src) &&
      !this.audio.error;

    if (!isTrackLoaded) {
      await this.loadAndPlayTrack(activeInSelected);
      return;
    }

    if (this.audio.paused) {
      this.audio.muted = this.isMuted;
      this.audio.volume = this.isMuted ? 0 : this.volume;
      try {
        await this.audio.play();
        this.playbackState = 'PLAY';
        this.showToast(`▶ ${activeInSelected.title}`);
      } catch (err) {
        console.warn('재개 실패, 트랙 재로드:', err);
        await this.loadAndPlayTrack(activeInSelected);
      }
    } else {
      this.audio.pause();
      this.playbackState = 'PAUSE';
      this.updatePlaybackIndicators();
      this.showToast('⏸ 일시정지');
    }
  }

  /**
   * STOP 버튼: 재생을 완전히 멈추고 재생 위치를 00:00으로 초기화
   */
  stopPlayback(silent = false) {
    this.audio.pause();
    try {
      this.audio.currentTime = 0;
    } catch (e) {
      // ignore if audio not ready
    }
    this.isPlaying = false;
    this.playbackState = silent ? 'READY' : 'STOP';
    document.body.classList.remove('is-playing');

    const seekSlider = document.getElementById('seekSlider');
    if (seekSlider) seekSlider.value = 0;

    const curTimeEl = document.getElementById('heroTimeCurrent');
    if (curTimeEl) curTimeEl.textContent = '00:00';

    this.renderAllLists();
    this.updatePlaybackIndicators();

    if (!silent) {
      this.showToast('⏹ 정지 (00:00)');
    }
  }

  async loadAndPlayTrack(track) {
    if (!this.requireAuth() || !track) return;
    this.currentTrackId = track.id;

    this.audio.pause();

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    let srcUrl = '';
    const mime = track.mimeType || 'audio/mpeg';

    if (track.blob instanceof Blob) {
      const typedBlob = track.blob.type ? track.blob : new Blob([track.blob], { type: mime });
      this.currentObjectUrl = URL.createObjectURL(typedBlob);
      srcUrl = this.currentObjectUrl;
    } else if (track.blob instanceof ArrayBuffer || ArrayBuffer.isView(track.blob)) {
      const typedBlob = new Blob([track.blob], { type: mime });
      this.currentObjectUrl = URL.createObjectURL(typedBlob);
      srcUrl = this.currentObjectUrl;
    } else if (track.downloadURL) {
      srcUrl = track.downloadURL;
    }

    if (!srcUrl) {
      this.loadedTrackId = null;
      this.showToast('⚠️ 오디오 데이터를 불러올 수 없습니다. 파일을 다시 업로드해 주세요.');
      return;
    }

    this.audio.src = srcUrl;
    this.audio.muted = this.isMuted;
    this.audio.volume = this.isMuted ? 0 : this.volume;
    this.loadedTrackId = track.id;
    this.audio.load();

    this.renderAllLists();
    this.updatePlaybackIndicators();

    try {
      await this.audio.play();
      this.playbackState = 'PLAY';
      this.updatePlaybackIndicators();
      this.showToast(`▶ ${track.title}`);
    } catch (err) {
      console.warn('재생 오류:', err);
      this.loadedTrackId = null;
      this.showToast(`⚠️ 재생할 수 없는 오디오 형식입니다 (${track.title})`);
    }
  }

  async playSpecificTrack(trackId) {
    if (!this.requireAuth()) return;
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;
    if (!track.selected) {
      track.selected = true;
      await this.storage.updateTrackSelected(track.id, true);
    }
    this.playMechanicalClick('play');
    await this.loadAndPlayTrack(track);
  }

  /**
   * 감기(FF): 누를 때마다 한 곡씩 앞으로
   */
  async nextTrack(isAutoEnded = false) {
    if (!isAutoEnded && !this.requireAuth()) return;
    const selected = this.getSelectedTracks();
    if (selected.length === 0) {
      this.showToast('선택된(REC) 곡이 없습니다.');
      return;
    }

    const currentIndex = selected.findIndex((t) => t.id === this.currentTrackId);
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % selected.length : 0;
    await this.loadAndPlayTrack(selected[nextIndex]);
  }

  /**
   * 되감기(REW): 누를 때마다 한 곡씩 뒤로
   */
  async prevTrack() {
    if (!this.requireAuth()) return;
    const selected = this.getSelectedTracks();
    if (selected.length === 0) {
      this.showToast('선택된(REC) 곡이 없습니다.');
      return;
    }

    const currentIndex = selected.findIndex((t) => t.id === this.currentTrackId);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : selected.length - 1;
    await this.loadAndPlayTrack(selected[prevIndex]);
  }

  /**
   * EJECT: 음질 무손실 최소용량 파일 업로드
   */
  async handleFilesUpload(files) {
    if (!this.requireAuth()) return;
    const progressBox = document.getElementById('uploadProgressBox');
    const progressText = document.getElementById('uploadProgressText');
    const progressPct = document.getElementById('uploadProgressPercent');

    if (progressBox) progressBox.classList.remove('hidden');

    let addedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const cleanTitle = file.name.replace(/\.[^/.]+$/, '');

      const updateStep = (pct, msg) => {
        if (progressText) progressText.textContent = `${cleanTitle} — ${msg}`;
        if (progressPct) progressPct.textContent = `${pct}%`;
      };

      try {
        const opt = await MymyAudioOptimizer.optimizeAudioFile(file, updateStep);
        await this.storage.addTrack(
          {
            title: cleanTitle,
            fileName: file.name,
            mimeType: opt.mimeType,
            duration: opt.duration,
            originalSize: opt.originalSize,
            compressedSize: opt.compressedSize,
            savedPercent: opt.savedPercent,
            bitrateKbps: opt.bitrateKbps,
            method: opt.method,
            selected: true,
            blob: opt.blob
          },
          updateStep
        );
        addedCount++;
      } catch (err) {
        console.error('업로드 실패:', file.name, err);
      }
    }

    if (progressBox) setTimeout(() => progressBox.classList.add('hidden'), 600);
    await this.refreshTrackList();
    if (addedCount > 0) this.showToast(`⏏ ${addedCount}곡 업로드 완료`);
  }

  /**
   * REC: 플레이할 음악 선택 토글
   */
  async toggleTrackSelection(trackId) {
    if (!this.requireAuth()) return;
    this.playMechanicalClick('rec');
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return;

    track.selected = !track.selected;
    await this.storage.updateTrackSelected(trackId, track.selected);

    if (!track.selected && this.currentTrackId === trackId) {
      const remaining = this.getSelectedTracks();
      if (remaining.length > 0 && this.isPlaying) {
        await this.loadAndPlayTrack(remaining[0]);
      } else {
        this.stopPlayback(true);
        this.currentTrackId = remaining[0] ? remaining[0].id : null;
      }
    }

    this.renderAllLists();
    this.updatePlaybackIndicators();
  }

  async selectAllTracks(selectState) {
    if (!this.requireAuth()) return;
    this.playMechanicalClick('rec');
    for (const t of this.tracks) {
      t.selected = selectState;
      await this.storage.updateTrackSelected(t.id, selectState);
    }
    if (!selectState) this.stopPlayback(true);
    this.renderAllLists();
    this.updatePlaybackIndicators();
  }

  /**
   * EJECT: 개별 삭제 및 전체 삭제
   */
  async deleteSingleTrack(trackId) {
    if (!this.requireAuth()) return;
    this.playMechanicalClick('eject');
    const target = this.tracks.find((t) => t.id === trackId);
    if (!target) return;

    if (this.currentTrackId === trackId) {
      this.stopPlayback(true);
      this.currentTrackId = null;
      this.loadedTrackId = null;
    }

    await this.storage.deleteTrack(target);
    await this.refreshTrackList();
    this.showToast(`🗑️ '${target.title}' 삭제됨`);
  }

  async addSampleTracks(silent = false) {
    if (!silent && !this.requireAuth()) return;
    try {
      localStorage.removeItem('mymy_samples_cleared');
      for (let i = 0; i < 3; i++) {
        const sampleFile = await MymyAudioOptimizer.createRetroSampleTrack(i);
        const opt = await MymyAudioOptimizer.optimizeAudioFile(sampleFile);
        const cleanTitle = sampleFile.name.replace(/\.[^/.]+$/, '');
        await this.storage.addTrack({
          title: cleanTitle,
          fileName: sampleFile.name,
          mimeType: opt.mimeType,
          duration: opt.duration,
          originalSize: opt.originalSize,
          compressedSize: opt.compressedSize,
          savedPercent: opt.savedPercent,
          bitrateKbps: opt.bitrateKbps,
          method: opt.method,
          selected: true,
          blob: opt.blob
        });
      }
      await this.refreshTrackList();
      if (!silent) {
        this.showToast('🎵 레트로 카세트 샘플 음원 3곡이 추가되었습니다.');
      }
    } catch (err) {
      console.warn('샘플 트랙 생성 오류:', err);
    }
  }

  async confirmDeleteAll() {
    if (!this.requireAuth() || this.tracks.length === 0) return;
    this.playMechanicalClick('eject');
    this.stopPlayback(true);
    this.currentTrackId = null;
    this.loadedTrackId = null;
    localStorage.setItem('mymy_samples_cleared', '1');
    await this.storage.deleteAllTracks(this.tracks);
    await this.refreshTrackList();
    this.showToast('🗑️ 전체 삭제 완료');
  }

  async refreshTrackList() {
    this.tracks = await this.storage.getAllTracks();
    const selected = this.getSelectedTracks();
    if (!this.currentTrackId && selected.length > 0) {
      this.currentTrackId = selected[0].id;
    }
    this.renderAllLists();
    this.updatePlaybackIndicators();
  }

  renderAllLists() {
    const selectedTracks = this.getSelectedTracks();

    // 1. REC 리스트
    const recListEl = document.getElementById('recTrackList');
    const recBadgeEl = document.getElementById('recStatusBadge');
    if (recBadgeEl) {
      recBadgeEl.textContent = `${selectedTracks.length} / ${this.tracks.length}곡 선택됨`;
    }

    if (recListEl) {
      if (this.tracks.length === 0) {
        recListEl.innerHTML = `<li class="empty-state">업로드된 음악이 없습니다. 아래 EJECT에서 파일을 추가해 주세요.</li>`;
      } else {
        recListEl.innerHTML = this.tracks
          .map((t) => {
            const isCurrent = t.id === this.currentTrackId && this.isPlaying;
            return `
              <li class="track-item ${t.selected ? 'active-playing' : ''}">
                <div class="track-info" onclick="app.playSpecificTrack('${t.id}')" style="cursor: pointer;" title="클릭하여 바로 재생">
                  <span class="track-name">${isCurrent ? '🔊 ' : '▶ '}${this.escapeHtml(t.title)}</span>
                  <span class="track-meta">${this.formatTime(t.duration)}</span>
                </div>
                <button
                  type="button"
                  class="rec-select-btn ${t.selected ? 'is-selected' : ''}"
                  onclick="app.toggleTrackSelection('${t.id}')"
                >
                  ${t.selected ? '● 선택됨' : '○ 선택'}
                </button>
              </li>
            `;
          })
          .join('');
      }
    }

    // 2. EJECT 리스트
    const ejectListEl = document.getElementById('ejectTrackList');
    const storageSummaryEl = document.getElementById('storageSummaryText');
    const totalCompBytes = this.tracks.reduce((acc, t) => acc + (t.compressedSize || 0), 0);

    if (storageSummaryEl) {
      storageSummaryEl.textContent = `${this.tracks.length}곡 · ${this.formatBytes(totalCompBytes)}`;
    }

    if (ejectListEl) {
      if (this.tracks.length === 0) {
        ejectListEl.innerHTML = `<li class="empty-state">업로드된 파일이 없습니다.</li>`;
      } else {
        ejectListEl.innerHTML = this.tracks
          .map((t) => {
            return `
              <li class="track-item">
                <div class="track-info">
                  <span class="track-name">${this.escapeHtml(t.title)}</span>
                  <span class="track-meta">${this.formatBytes(t.compressedSize)} · ${this.formatTime(t.duration)}</span>
                </div>
                <button
                  type="button"
                  class="delete-item-btn"
                  onclick="app.deleteSingleTrack('${t.id}')"
                >
                  삭제
                </button>
              </li>
            `;
          })
          .join('');
      }
    }
  }

  updatePlaybackIndicators() {
    const loggedIn = this.storage.isLoggedIn();
    const selected = this.getSelectedTracks();
    const currentTrack =
      selected.find((t) => t.id === this.currentTrackId) ||
      selected[0] ||
      null;

    const heroLcdState = document.getElementById('heroLcdState');
    const heroTrackTitle = document.getElementById('heroTrackTitle');
    const playCallout = document.getElementById('playCalloutLabel');

    if (heroLcdState) {
      const stateLabel = !loggedIn
        ? 'LOCKED'
        : this.isPlaying
          ? 'PLAY'
          : this.playbackState === 'STOP'
            ? 'STOP'
            : this.playbackState === 'PAUSE'
              ? 'PAUSE'
              : 'READY';
      heroLcdState.textContent = stateLabel;
      heroLcdState.classList.toggle('playing', loggedIn && this.isPlaying);
      heroLcdState.classList.toggle('paused', loggedIn && !this.isPlaying && this.playbackState === 'PAUSE');
      heroLcdState.classList.toggle('stopped', loggedIn && !this.isPlaying && this.playbackState === 'STOP');
    }

    if (heroTrackTitle) {
      heroTrackTitle.textContent = !loggedIn
        ? '오른쪽 상단에서 로그인 후 사용할 수 있습니다 (기본: admin / 1234)'
        : currentTrack
          ? currentTrack.title
          : '선택된 음악이 없습니다 (REC 버튼으로 선곡)';
    }

    if (playCallout) {
      playCallout.textContent = this.isPlaying ? '⏸ PAUSE' : '▶ PLAY';
    }
  }

  openCloudModal() {
    const modal = document.getElementById('cloudModal');
    const input = document.getElementById('firebaseConfigInput');
    const activeCfg = this.storage.getActiveFirebaseConfig();
    if (input && activeCfg) input.value = JSON.stringify(activeCfg, null, 2);
    if (modal) modal.classList.remove('hidden');
  }

  closeCloudModal() {
    const modal = document.getElementById('cloudModal');
    if (modal) modal.classList.add('hidden');
  }

  async saveFirebaseConfig() {
    const input = document.getElementById('firebaseConfigInput');
    if (!input) return;
    try {
      await this.storage.saveFirebaseConfigFromInput(input.value);
      this.updateCloudBadge();
      await this.refreshTrackList();
      this.closeCloudModal();
      this.showToast('☁️ Firebase 설정이 저장되었습니다.');
    } catch (err) {
      alert(err.message);
    }
  }

  async clearFirebaseConfig() {
    localStorage.removeItem('mymy_firebase_config');
    await this.storage.tryInitFirebase();
    this.updateCloudBadge();
    this.closeCloudModal();
    this.showToast('로컬 모드로 전환되었습니다.');
  }

  updateCloudBadge() {
    const dot = document.getElementById('cloudStatusDot');
    if (dot) {
      dot.className = this.storage.isFirebaseConnected ? 'status-dot firebase' : 'status-dot local';
    }
  }

  showToast(message) {
    const toast = document.getElementById('retroToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => toast.classList.add('hidden'), 2400);
  }

  formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '00:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 KB';
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  escapeHtml(str = '') {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

const app = new MymyPlayerApp();
window.app = app;
window.addEventListener('DOMContentLoaded', () => app.init());
