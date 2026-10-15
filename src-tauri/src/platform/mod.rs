//! OS마다 다른 부분만 모아 둔 곳.
//!
//! - `win.rs`   : Windows (완성)
//! - `other.rs` : macOS·Linux 기본 동작 (맥 전용 마무리는 다음 단계)
//!
//! 두 파일은 같은 이름의 함수를 제공하고, 나머지 코드는 OS를 신경 쓰지 않습니다.

use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Drive {
    pub root: PathBuf,
    pub name: String,
    pub total: u64,
    pub free: u64,
}

#[cfg(windows)]
mod win;
#[cfg(windows)]
pub use self::win::*;

#[cfg(not(windows))]
mod other;
#[cfg(not(windows))]
pub use self::other::*;
