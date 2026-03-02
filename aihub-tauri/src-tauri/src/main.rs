// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // In macOS dev builds, relaunch through a temporary .app bundle so the Dock
    // shows "FCC AI Hub" instead of the Cargo binary name "fcc-aihub".
    // Release builds already use a proper .app bundle via Tauri's bundler.
    #[cfg(all(target_os = "macos", debug_assertions))]
    if std::env::var_os("__AIHUB_BUNDLED").is_none() {
        dev_bundle::relaunch_as_bundle();
    }

    fcc_aihub_lib::run()
}

#[cfg(all(target_os = "macos", debug_assertions))]
mod dev_bundle {
    use std::os::unix::fs::PermissionsExt;
    use std::path::Path;

    /// Create a minimal .app bundle and relaunch through it.
    /// On success this function never returns (calls process::exit).
    /// On failure it returns so the app runs normally (without the Dock fix).
    pub fn relaunch_as_bundle() {
        let exe = match std::env::current_exe() {
            Ok(p) => p,
            Err(_) => return,
        };

        let Some(target_dir) = exe.parent() else {
            return;
        };
        let bundle = target_dir.join("FCC AI Hub.app");

        if create_or_update_bundle(&bundle, &exe).is_err() {
            return;
        }

        // Kill stale bundle process from a previous dev run
        let _ = std::process::Command::new("/usr/bin/pkill")
            .args(["-f", "FCC AI Hub.app/Contents/MacOS/launcher"])
            .output();

        std::thread::sleep(std::time::Duration::from_millis(300));

        // Launch through the bundle and wait for it to exit
        match std::process::Command::new("/usr/bin/open")
            .args(["-W", "-n", "-a", &bundle.to_string_lossy()])
            .status()
        {
            Ok(s) => std::process::exit(s.code().unwrap_or(0)),
            Err(_) => {} // fall through to normal run
        }
    }

    fn create_or_update_bundle(
        bundle: &Path,
        exe: &Path,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let contents = bundle.join("Contents");
        let macos = contents.join("MacOS");

        std::fs::create_dir_all(&macos)?;

        // Info.plist
        std::fs::write(
            contents.join("Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>FCC AI Hub</string>
    <key>CFBundleDisplayName</key>
    <string>FCC AI Hub</string>
    <key>CFBundleExecutable</key>
    <string>launcher</string>
    <key>CFBundleIdentifier</key>
    <string>gov.fcc.aihub.dev</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
</dict>
</plist>"#,
        )?;

        // Launcher script — sets env flag and exec's the real binary
        let launcher = macos.join("launcher");
        std::fs::write(
            &launcher,
            format!(
                "#!/bin/sh\nexport __AIHUB_BUNDLED=1\nexec \"{}\" \"$@\"\n",
                exe.display()
            ),
        )?;
        std::fs::set_permissions(&launcher, std::fs::Permissions::from_mode(0o755))?;

        // Copy app icon if available
        // exe is at src-tauri/target/debug/fcc-aihub
        if let Some(src_tauri) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            let icon_src = src_tauri.join("icons/icon.icns");
            if icon_src.exists() {
                let resources = contents.join("Resources");
                std::fs::create_dir_all(&resources)?;
                std::fs::copy(icon_src, resources.join("icon.icns"))?;
            }
        }

        Ok(())
    }
}
