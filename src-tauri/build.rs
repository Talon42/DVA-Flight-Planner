use std::{env, fs, path::PathBuf};

fn main() {
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=../simbrief/api_key.txt");

    if let Some(api_key) = load_simbrief_api_key() {
        println!("cargo:rustc-env=SIMBRIEF_BUNDLED_API_KEY={api_key}");
    }

    tauri_build::build()
}

fn load_simbrief_api_key() -> Option<String> {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").ok()?);
    let api_key_path = manifest_dir.join("..").join("simbrief").join("api_key.txt");
    let text = fs::read_to_string(api_key_path).ok()?;
    let trimmed = text.trim();

    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}
