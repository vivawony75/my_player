# 📼 SAMSUNG mymy (MY-F65) 레트로 스크롤 음악 플레이어

올려주신 **삼성 마이마이(mymy) 핑크 카세트 플레이어** 이미지를 기반으로 제작된 스크롤형 웹 음악 플레이어입니다.

## ✨ 주요 기능 (요구사항 완벽 반영)

1. **방식 A (이미지 물리 버튼 + 스무스 스크롤 이동)**
   - 상단 마이마이 이미지 위의 **`EJECT`**, **`REC`**, **`PLAY`**, **`STOP`**, **`감기(FF)`**, **`되감기(REW)`**, **`볼륨 다이얼(VOL)`** 핫스팟을 클릭하면 기계식 버튼 클릭음과 함께 해당 섹션으로 부드럽게 스크롤 이동하거나 즉시 동작합니다.
2. **음질 손실 없는 최소 용량 저장 (`audio-compressor.js`)**
   - **MP3/AAC 등 고효율 포맷**: 재인코딩으로 인한 이중 음질 열화(Generation Loss)를 방지하기 위해 오디오 프레임은 100% 원본 그대로 유지하고, 불필요한 비대 ID3v2 패딩/메타데이터만 무손실 제거합니다.
   - **WAV/FLAC 등 고용량 무압축 포맷**: `OfflineAudioContext`를 통해 앞뒤 완전 무음 트림, 중복 스테레오 채널 무손실 단일화, 44.1kHz/16-bit 스튜디오 마스터 패킹으로 음질 저하 없이 용량을 최소화합니다.
3. **`EJECT` 버튼 (파일 업로드 & 삭제)**
   - 드래그 앤 드롭 또는 파일 선택으로 여러 곡을 한 번에 업로드하고 개별 삭제 또는 전체 삭제할 수 있습니다.
4. **`REC` 버튼 (플레이할 음악 선정하기)**
   - 업로드된 전체 음악 리스트를 보여주고, **`[● REC 선택됨]` / `[○ 플레이 선택]`** 토글 버튼으로 재생할 곡만 고를 수 있습니다.
5. **`PLAY` / `STOP` 버튼 (선택된 곡 재생 · 일시정지 · 완전 정지)**
   - `PLAY`: `REC` 섹션에서 선택된 곡들만 순서대로 재생/일시정지하며, 재생 중에는 마이마이 본체 창 안의 카세트 테이프 릴과 우측 상단 `BATTERY` 3연동 LED가 회전/점등됩니다.
   - `STOP`: 재생을 완전히 멈추고 현재 곡의 재생 위치를 `00:00`(처음)으로 초기화합니다.
6. **`감기(FF)` / `되감기(REW)`**
   - 누를 때마다 선택된 곡 리스트에서 정확히 **한 곡씩 앞으로(`+1`) 또는 뒤로(`-1`)** 이동합니다.
7. **볼륨 조절 기능 (`VOL`)**
   - 마이마이 좌측 하단 은색 볼륨 다이얼 위에서 마우스 휠을 굴리거나 슬라이더/음소거 버튼을 조작하여 `0% ~ 100%` 볼륨을 실시간 조절합니다.

---

## 🚀 `my_player` 프로젝트의 Firebase(`myplayer-3df2c`) · GitHub · Vercel 연동

### 1단계: Firebase(`myplayer-3df2c`) 웹 앱 설정값 확인 및 `.env` 입력
1. [Firebase 콘솔 (`myplayer-3df2c`)](https://console.firebase.google.com/project/myplayer-3df2c/settings/general)의 **프로젝트 설정(⚙️) > 일반 > 내 앱**에서 웹 앱(`</>`)의 `firebaseConfig` 값을 확인합니다.
2. 폴더 내 `.env` 파일(이미 `.gitignore`에 등록되어 GitHub에 노출되지 않음)에 `apiKey`, `messagingSenderId`, `appId`를 입력합니다 (`projectId`, `authDomain`, `storageBucket`은 `myplayer-3df2c`로 기본 설정 완료).

### 2단계: GitHub(`my_player`) 저장소에 코드 업로드
- 바탕화면 `플레이어` 폴더 안의 파일들을 GitHub `my_player` 저장소에 업로드(또는 `git push`)합니다.
- `.gitignore`에 `.env`와 `.env.local`이 포함되어 있어 로컬 `.env` 파일은 안전하게 제외됩니다.

### 3단계: Vercel 배포 및 Environment Variables(환경 변수) 등록
1. Vercel 대시보드에서 `my_player` 저장소를 Import(또는 기존 프로젝트의 **Settings > Environment Variables**로 이동)합니다.
2. 아래 환경 변수 키와 Firebase에서 복사한 값을 입력한 뒤 **Deploy(또는 Redeploy)** 를 클릭하면 `/api/firebase-config` 엔드포인트를 통해 자동으로 연동됩니다:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` (`myplayer-3df2c.firebaseapp.com`)
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (`myplayer-3df2c`)
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` (`myplayer-3df2c.firebasestorage.app`)
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
