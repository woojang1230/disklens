@echo off
chcp 65001 >nul
REM DiskLens 배포용 빌드. 끝나면 같은 폴더에 DiskLens.exe가 생깁니다.
where cargo >nul 2>nul
if errorlevel 1 (
  echo [오류] Rust가 설치되어 있지 않아요. README.md의 "빌드 준비"를 먼저 따라 하세요.
  pause
  exit /b 1
)
cargo tauri --version >nul 2>nul
if errorlevel 1 (
  echo Tauri CLI를 설치하는 중이에요. 처음 한 번만 몇 분 걸려요.
  cargo install tauri-cli --version "^2" --locked
  if errorlevel 1 (
    echo [오류] Tauri CLI를 설치하지 못했어요.
    pause
    exit /b 1
  )
)
cargo tauri build
if errorlevel 1 (
  echo [오류] 빌드에 실패했어요. 위 메시지를 확인하세요.
  pause
  exit /b 1
)
copy /Y src-tauri\target\release\disklens.exe DiskLens.exe >nul
echo.
echo 완료: %cd%\DiskLens.exe
echo 설치 파일: src-tauri\target\release\bundle\
pause
