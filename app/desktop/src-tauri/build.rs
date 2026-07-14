use std::fs;
use std::path::Path;

fn main() {
    // tauri::generate_context! refuses to expand unless `frontendDist`
    // (../frontend-dist, gitignored) exists at compile time. The real export
    // comes from build-frontend.sh (local) or desktop.yml (CI) right before
    // bundling; for a bare `cargo check` / `cargo clippy` on a fresh clone,
    // seed an obviously-fake placeholder so the Rust gate never needs a full
    // Next.js build. build-frontend.sh clobbers this with the real export.
    let dist = Path::new(env!("CARGO_MANIFEST_DIR")).join("../frontend-dist");
    if !dist.join("index.html").exists() {
        fs::create_dir_all(&dist).expect("create frontend-dist placeholder dir");
        fs::write(
            dist.join("index.html"),
            "<!doctype html><title>zcrypt placeholder \u{2014} run build-frontend.sh for a real export</title>\n",
        )
        .expect("write frontend-dist placeholder index.html");
        println!(
            "cargo:warning=frontend-dist was missing; wrote a placeholder index.html (run app/desktop/build-frontend.sh for the real export before bundling)"
        );
    }
    // Re-run when frontend-dist changes (including deletion) so the
    // placeholder is re-seeded before the macro re-expands.
    println!("cargo:rerun-if-changed=../frontend-dist");
    tauri_build::build()
}
