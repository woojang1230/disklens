//! 핵심 로직 테스트: 임시 폴더를 만들어 스캔·분석·중복·삭제를 실제로 돌려 봅니다.

use crate::*;
use std::fs;
use std::path::PathBuf;

fn tmp(name: &str) -> PathBuf {
    let p = std::env::temp_dir().join(format!("disklens_test_{}_{}", name, std::process::id()));
    let _ = fs::remove_dir_all(&p);
    fs::create_dir_all(&p).unwrap();
    p
}

#[test]
fn scan_analyze_dup_delete() {
    let root = tmp("flow");
    fs::create_dir_all(root.join("a/b")).unwrap();
    fs::create_dir_all(root.join("c")).unwrap();
    fs::write(root.join("a/b/big.mp4"), vec![1u8; 300_000]).unwrap();
    fs::write(root.join("a/copy1.bin"), vec![7u8; 200_000]).unwrap();
    fs::write(root.join("c/copy2.bin"), vec![7u8; 200_000]).unwrap();
    let mut diff = vec![7u8; 200_000];
    diff[199_999] = 8; // 같은 크기, 앞부분 같고 끝만 다름
    fs::write(root.join("c/notcopy.bin"), diff).unwrap();
    fs::write(root.join("small.txt"), b"hello").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(root.join("a"), root.join("link_to_a")).unwrap();

    let prog = scan::Progress::default();
    let tree = scan::scan(&root, &prog, &[]);
    assert_eq!(tree.files, 5);
    assert_eq!(tree.size, 300_000 + 600_000 + 5);
    let names: Vec<&str> = tree.children.iter().map(|c| &*c.name).collect();
    assert_eq!(names, vec!["a", "c", "small.txt"]);

    let big = analysis::big_files(&tree, &root, 2);
    assert_eq!(big.len(), 2);
    assert!(big[0].path.ends_with("a/b/big.mp4"));

    let ts = analysis::type_stats(&tree, &root);
    assert_eq!(ts.cats[0].0, 300_000); // 동영상
    assert_eq!(ts.total, tree.size);

    let groups = analysis::size_groups(&tree, &root, 1);
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].1.len(), 3);
    let dprog = dup::Progress::default();
    let d = dup::find(groups, &dprog);
    assert_eq!(d.len(), 1, "notcopy.bin must be excluded by full hash");
    assert_eq!(d[0].files.len(), 2);
    assert_eq!(d[0].wasted(), 200_000);

    // nav/경로 왕복
    let nav = scan::find_nav(&tree, &root, &root.join("a").join("b")).unwrap();
    assert_eq!(scan::path_of(&root, &tree, &nav), root.join("a").join("b"));

    // 영구 삭제 + 트리 갱신
    let mut tree = tree;
    let target = root.join("a/b");
    let r = delete::run(
        vec![delete::Op { path: target.clone(), size: 300_000, trash: false }],
        &delete::Progress::default(),
    );
    assert_eq!(r.ok, 1);
    assert_eq!(r.freed, 300_000);
    assert!(!target.exists());
    for p in &r.removed {
        scan::remove_path(&mut tree, &root, p);
    }
    assert_eq!(tree.size, 600_000 + 5);
    assert_eq!(tree.files, 4);
    assert_eq!(tree.children.iter().find(|c| &*c.name == "a").unwrap().size, 200_000);

    fs::remove_file(root.join("small.txt")).unwrap();

    let (sz, newest) = cleanup::dir_size(&root);
    assert_eq!(sz, 600_000);
    assert!(newest > 0);
    // 심볼릭 링크 대상은 삭제되지 않아야 함
    #[cfg(unix)]
    {
        let r = delete::run(
            vec![delete::Op { path: root.join("link_to_a"), size: 0, trash: false }],
            &delete::Progress::default(),
        );
        assert_eq!(r.ok, 1);
        assert!(root.join("a/copy1.bin").exists());
    }
    fs::remove_dir_all(&root).unwrap();
}

#[cfg(not(windows))]
#[test]
fn cleanup_analyze_runs() {
    let cats = cleanup::analyze(platform::cleanup_categories(), None);
    assert!(cats.iter().any(|c| c.id == "user_cache"));
}

#[test]
fn scan_skip_list() {
    let root = tmp("skip");
    fs::create_dir_all(root.join("keep")).unwrap();
    fs::create_dir_all(root.join("skipme")).unwrap();
    fs::write(root.join("keep/a.bin"), vec![0u8; 1000]).unwrap();
    fs::write(root.join("skipme/b.bin"), vec![0u8; 5000]).unwrap();
    let t = scan::scan(&root, &scan::Progress::default(), &[root.join("skipme")]);
    assert_eq!(t.size, 1000);
    assert_eq!(t.children.len(), 1);
    fs::remove_dir_all(&root).unwrap();
}

#[cfg(not(windows))]
#[test]
fn platform_fallback_basics() {
    let d = platform::list_drives();
    assert!(!d.is_empty() && d[0].total > 0);
    assert!(platform::is_protected(std::path::Path::new("/")));
    assert!(platform::is_protected(std::path::Path::new("/usr/lib")));
    assert!(!platform::is_protected(std::path::Path::new("/tmp/x")));
    assert!(!platform::scan_skip(std::path::Path::new("/")).is_empty());
    let cats = cleanup::analyze(platform::cleanup_categories(), None);
    assert!(cats.iter().any(|c| c.id == "recycle"));
}

#[test]
fn cleanup_drive_filter() {
    use std::path::Path;
    assert!(cleanup::on_drive(Path::new(r"C:\Users\kim\AppData"), Some(Path::new(r"C:\"))));
    assert!(cleanup::on_drive(Path::new(r"c:\temp"), Some(Path::new(r"C:\"))));
    assert!(!cleanup::on_drive(Path::new(r"D:\Games"), Some(Path::new(r"C:\"))));
    assert!(cleanup::on_drive(Path::new(r"D:\Games"), None));
    assert!(!cleanup::on_drive(Path::new(r"C:\Usersx"), Some(Path::new(r"C:\Users"))));
}

fn node(name: &str, size: u64, children: Vec<scan::Node>) -> scan::Node {
    let is_dir = !children.is_empty() || !name.contains('.');
    let files = if is_dir { children.iter().map(|c| c.files).sum() } else { 1 };
    scan::Node { name: name.into(), size, files, mtime: 0, is_dir, children }
}

#[test]
fn sunburst_depth_limit_and_thin_grouping() {
    use std::path::Path;
    // DEPTH보다 두 단계 더 내려가는 폴더: 도넛에는 DEPTH 단계까지만 실림
    let mut deep = node("deep.bin", 7200, vec![]);
    for d in (1..=sunburst::DEPTH + 1).rev() {
        deep = node(&format!("d{d}"), 7200, vec![deep]);
    }
    // 전체의 1/360보다 얇은 항목(10, 5)은 '그 외'로 묶이고, 크기 0은 빠짐
    let root = node("root", 7215, vec![deep, node("a.txt", 10, vec![]), node("b.txt", 5, vec![]), node("z.txt", 0, vec![])]);
    let base = Path::new("/r");
    let rings = sunburst::build(&root, base);

    assert_eq!(rings.len(), 2);
    assert_eq!(rings[0].name, "d1");
    assert_eq!(rings[0].path, base.join("d1").display().to_string());
    assert_eq!(rings[0].rest, 0);
    assert_eq!((rings[1].size, rings[1].rest), (15, 2));
    assert!(rings[1].children.is_empty());

    let mut depth = 0;
    let mut n = &rings[0];
    loop {
        depth += 1;
        match n.children.first() {
            Some(c) => n = c,
            None => break,
        }
    }
    assert_eq!(depth, sunburst::DEPTH);
    let want: Vec<String> = (1..=sunburst::DEPTH).map(|d| format!("d{d}")).collect();
    assert_eq!(n.path, base.join(want.join("/")).display().to_string());
}

#[test]
fn sunburst_threshold_is_relative_to_whole_folder() {
    use std::path::Path;
    // 하위 폴더 안에서는 큰 편이어도, 지금 폴더 전체에 비해 얇으면 묶임
    // thin.bin: sub(100)에 비하면 10%지만 전체(7300)의 1/360보다 얇음
    let sub = node("sub", 100, vec![node("big.bin", 90, vec![]), node("thin.bin", 10, vec![])]);
    let root = node("root", 7300, vec![node("other.bin", 7200, vec![]), sub]);
    let rings = sunburst::build(&root, Path::new("/r"));
    let kids = &rings[1].children;
    assert_eq!(kids.len(), 2);
    assert_eq!(kids[0].name, "big.bin");
    assert_eq!((kids[1].size, kids[1].rest), (10, 1));
    assert!(sunburst::build(&node("empty", 0, vec![]), Path::new("/r")).is_empty());
}

#[test]
fn sunburst_thin_boundary_is_one_degree() {
    use std::path::Path;
    // 전체 3600에서 1° = 10. 정확히 10이면 남기고, 9면 '그 외'로 묶음
    let keep = node("root", 3600, vec![node("big.bin", 3590, vec![]), node("one.bin", 10, vec![])]);
    let rings = sunburst::build(&keep, Path::new("/r"));
    assert_eq!((rings[1].name.as_str(), rings[1].rest), ("one.bin", 0));
    let thin = node("root", 3600, vec![node("big.bin", 3591, vec![]), node("thin.bin", 9, vec![])]);
    let rings = sunburst::build(&thin, Path::new("/r"));
    assert_eq!((rings[1].size, rings[1].rest), (9, 1));
}
