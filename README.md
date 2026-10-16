# DiskLens

드라이브 용량을 한눈에 보고 정리하는 데스크톱 앱입니다. Rust + [Tauri 2](https://v2.tauri.app)로 만들었고, 화면은 HTML/CSS/JS입니다.

- **Windows**: 완성
- **macOS**: 빌드·실행은 되지만 맥 전용 정리 경로, 볼륨 처리 등은 다음 단계에서 다듬을 예정

## 기능

**사용 흐름**: 드라이브 선택 → 스캔 → 그 드라이브에서 분석과 정리. 다른 드라이브는 드라이브 목록으로 돌아가 다시 스캔합니다. Docker처럼 드라이브와 상관없는 프로그램 정리는 왼쪽 메뉴에서 언제든 열 수 있습니다.

| 메뉴 | 화면 |
|---|---|
| 홈 (로고 클릭) | 드라이브 카드 + 프로그램 카드 |
| 드라이브 정리 및 분석 | 드라이브 카드, 특정 폴더만 스캔 |
| └ 스캔한 드라이브 | 탭: 폴더 분석 · 큰 파일 · 파일 종류 │ 정리 추천 · 중복 파일 |
| 프로그램 정리 및 분석 | 프로그램 카드 |
| └ Docker | 이미지·빌드 캐시·컨테이너·볼륨 정리, WSL2 가상 디스크 압축 |

- **폴더 분석**: 큰 순서 목록 + 트리맵(한 단계 아래까지) 또는 도넛(여섯 단계 아래까지, 조각을 누르면 그 폴더로), 열기·탐색기에서 보기·경로 복사·휴지통
- **큰 파일**: 상위 1,000개, 검색, 종류 필터, 여러 개 골라 휴지통으로
- **파일 종류**: 종류별 도넛 차트, 확장자별 순위
- **정리 추천**: 스캔한 드라이브에 있는 임시 파일, 브라우저 캐시, 휴지통, 크래시 덤프, 개발 캐시, 업데이트 파일, 오래된 다운로드
- **중복 파일**: 크기 → 앞부분 해시 → 전체 해시로 진짜 같은 파일만, 그룹마다 원본 하나 남기기

라이트/다크 모드는 Windows 설정을 따라갑니다.

### 안전장치

- 사용자가 고른 파일은 항상 **휴지통으로** 옮깁니다.
- 영구 삭제는 정리 추천의 캐시·임시 파일처럼 다시 만들어지는 것만 합니다.
- 실행 전에 항상 확인 창에서 지울 목록과 용량을 보여줍니다.
- `C:\Windows`, `Program Files`, `ProgramData`, 드라이브 루트, 사용자 프로필·AppData 루트, `pagefile.sys` 등은 지울 수 없습니다.
- 심볼릭 링크·정션은 따라가지 않습니다. 사용 중인 파일은 건너뜁니다.
- Docker 볼륨은 데이터가 들어 있을 수 있어 기본 선택에서 빠져 있습니다.

## 빌드 준비 (처음 한 번)

### Windows

PowerShell에서:

```powershell
winget install Rustlang.Rustup
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

터미널을 새로 연 뒤:

```powershell
cargo install tauri-cli --version "^2" --locked
```

WebView2는 Windows 10/11에 기본으로 들어 있습니다.

### macOS

```bash
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install tauri-cli --version "^2" --locked
```

## 실행과 빌드

프로젝트 폴더(이 README가 있는 곳)에서:

```bash
cargo tauri dev     # 개발 모드로 바로 실행
cargo tauri build   # 배포용 빌드
```

Windows에서는 `build.bat`을 더블클릭해도 됩니다.

빌드 결과:
- Windows: `src-tauri/target/release/disklens.exe`, 설치 파일은 `src-tauri/target/release/bundle/` 아래 (`.msi`, `-setup.exe`)
- macOS: `src-tauri/target/release/bundle/macos/DiskLens.app`, `bundle/dmg/`

GitHub에 올리면 `.github/workflows/build.yml`이 Windows와 macOS에서 자동으로 빌드해 Actions 탭의 Artifacts에 올려 줍니다.

## 구조

```
ui/                    화면 (빌드 단계 없이 그대로 사용)
  index.html
  styles.css           시안의 색·간격·글꼴
  app.js               화면 그리기와 동작
  fonts/               IBM Plex Sans KR, IBM Plex Mono (OFL)
src-tauri/
  tauri.conf.json      창 크기, 앱 이름, 아이콘
  capabilities/        화면이 쓸 수 있는 권한
  icons/               앱 아이콘
  src/
    main.rs            앱 시작, 명령 등록
    commands.rs        화면에서 부르는 명령, 백그라운드 작업과 진행 이벤트
    scan.rs            병렬 디렉터리 스캔, 결과 트리
    analysis.rs        큰 파일, 종류 통계, 중복 후보
    dup.rs             해시로 중복 확인
    cleanup.rs         정리 추천 크기 계산
    delete.rs          휴지통 이동 / 영구 삭제
    docker.rs          docker system df, prune
    util.rs            공통 도우미
    platform/
      mod.rs           OS별 기능 목록
      win.rs           Windows: 드라이브, 정리 경로, 휴지통, 탐색기, WSL 가상 디스크
      other.rs         macOS·Linux 기본 동작 (맥 버전에서 다듬을 곳)
```

OS마다 다른 부분은 `platform/` 안에만 있습니다. 맥 버전은 `other.rs`(또는 새 `mac.rs`)만 채우면 됩니다.

테스트: `cd src-tauri && cargo test`
