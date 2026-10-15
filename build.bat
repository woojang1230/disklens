@echo off
REM DiskLens 릴리스 빌드. 완료되면 같은 폴더에 disklens.exe가 생깁니다.
chcp 65001 >nul
where cargo >nul 2>nul
if errorlevel 1 (
  echo [오류] Rust가 설치되어 있지 않아요. README.md의 "빌드 준비"를 먼저 따라 하세요.
  pause
  exit /b 1
)
cargo build --release
if errorlevel 1 (
  echo [오류] 빌드에 실패했어요. 위 메시지를 확인하세요.
  pause
  exit /b 1
)
copy /Y target\release\disklens.exe disklens.exe >nul
echo.
echo 완료: %cd%\disklens.exe
pause
