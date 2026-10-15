# DiskLens

Windows 드라이브 용량을 빠르게 분석하고 정리하는 프로그램입니다. Rust + egui로 만들어 단일 exe(약 5~10MB)로 동작합니다.

## 기능

| 탭 | 하는 일 |
|---|---|
| 폴더 분석 | 드라이브(또는 지정 폴더)를 병렬로 스캔해 큰 순서로 표시, 오른쪽에 트리맵. 더블클릭으로 들어가고 Backspace로 나옴. 우클릭: 탐색기에서 보기·경로 복사·휴지통으로 |
| 큰 파일 | 용량 큰 파일 상위 1,000개, 이름·경로·확장자 검색, 여러 개 골라 휴지통으로 |
| 파일 종류 | 동영상·이미지·설치 파일 등 종류별, 확장자별 용량 |
| 정리 추천 | 임시 파일, Windows 임시 파일, 브라우저 캐시(Chrome·Edge·Brave·웨일·Firefox), 휴지통, 크래시 덤프, 개발 도구 캐시, Windows 업데이트 다운로드, 180일 지난 다운로드 |
| 중복 파일 | 크기 → 앞 64KB 해시 → 전체 해시(BLAKE3) 순으로 진짜 같은 파일만 찾음. 그룹마다 하나만 남기고 선택 가능 |
| Docker | `docker system df`로 회수 가능 용량 표시, 이미지·빌드 캐시·중지된 컨테이너·볼륨 prune. Docker Desktop(WSL2) 가상 디스크(.vhdx) 압축 |

### 안전장치

- 사용자가 고른 파일은 항상 **휴지통으로** 옮깁니다(되돌리기 가능).
- 영구 삭제는 정리 추천 탭의 캐시·임시 파일처럼 다시 만들어지는 것만 합니다.
- 실행 전에 항상 지울 목록과 용량을 보여 주는 확인 창이 뜹니다.
- `C:\Windows`, `Program Files`, `ProgramData`, 드라이브 루트, 사용자 프로필·AppData 루트는 지울 수 없게 막아 둡니다.
- 심볼릭 링크·정션은 따라가지 않아 중복 집계나 링크 너머 삭제가 없습니다.
- 사용 중인 파일은 건너뛰고 나머지만 지웁니다.
- Docker 볼륨은 데이터가 들어 있을 수 있어 기본 선택에서 빠져 있습니다.

## 빌드 준비 (처음 한 번)

PowerShell을 열고:

```powershell
# 1. Rust 설치
winget install Rustlang.Rustup

# 2. C++ 빌드 도구 (Rust가 Windows에서 링크할 때 필요)
winget install Microsoft.VisualStudio.2022.BuildTools --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

설치 후 터미널을 새로 여세요. 이미 Visual Studio(C++ 포함)가 있다면 2번은 건너뛰어도 됩니다.

## 빌드

`build.bat`을 더블클릭하거나:

```powershell
cd disklens
cargo build --release
```

`target\release\disklens.exe`가 만들어집니다. 처음 빌드는 라이브러리를 받느라 몇 분 걸립니다.

GitHub에 올리면 `.github/workflows/build.yml`이 Windows에서 자동 빌드해 Actions 탭의 Artifacts로 exe를 올려 줍니다.

## 사용 팁

- **관리자 권한으로 실행**하면 `Windows\Temp`, 다른 사용자 폴더 등 막혀 있던 곳까지 집계·정리됩니다. 스캔 후 권한 오류가 있으면 화면에 "관리자로 다시 실행" 버튼이 나옵니다.
- 표시 크기는 파일의 논리 크기입니다. NTFS 압축 파일이나 OneDrive의 '온라인 전용' 파일은 실제 디스크 사용량보다 크게 보일 수 있습니다.
- 휴지통으로 보낸 파일은 휴지통을 비워야 공간이 생깁니다(정리 추천 → 휴지통).

### Docker 공간을 실제로 돌려받으려면

Docker Desktop은 모든 이미지·컨테이너를 `%LOCALAPPDATA%\Docker\wsl\...\*.vhdx` 가상 디스크 하나에 담습니다. 이 파일은 커지기만 하고 자동으로 줄지 않아서, Docker 안에서 prune해도 C: 여유 공간은 그대로입니다.

1. Docker 탭에서 정리할 항목을 고르고 **선택 항목 정리** (Docker Desktop 실행 중이어야 함)
2. 트레이 아이콘에서 **Quit Docker Desktop**으로 완전히 종료
3. **가상 디스크 압축** → 관리자 권한 확인 → `wsl --shutdown` 후 `diskpart`의 `compact vdisk`로 빈 공간을 돌려줍니다

## 구조

```
src/
  main.rs      창 설정, 한글 글꼴(맑은 고딕) 로드
  app.rs       화면과 백그라운드 작업 관리
  scan.rs      rayon 병렬 디렉터리 스캔, 결과 트리
  analysis.rs  큰 파일, 종류 통계, 중복 후보
  dup.rs       해시 기반 중복 확인
  cleanup.rs   정리 추천 항목 정의와 크기 계산
  delete.rs    휴지통 이동 / 영구 삭제
  docker.rs    docker system df, prune, vhdx 압축
  drives.rs    드라이브 목록과 여유 공간 (Win32 API)
  treemap.rs   squarified treemap 배치
  util.rs      포맷, 탐색기 열기, 보호 경로 판정
```

테스트: `cargo test`

## 더 해볼 만한 것

- NTFS MFT 직접 읽기(관리자 권한 필요)로 스캔을 수 초 단위로 단축
- 스캔 결과 저장·비교(지난주 대비 늘어난 폴더)
- `node_modules`, `target`, `.venv` 같은 개발 산출물 폴더 찾기
