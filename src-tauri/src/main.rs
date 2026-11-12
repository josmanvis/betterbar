// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // A dock has to do two things Wayland does not let a client do: place its
    // own window at a screen edge, and reserve that edge so maximized windows
    // do not cover it. Wayland has no way to set a surface's position, and the
    // only space-reservation protocol (wlr-layer-shell) is not implemented by
    // GNOME's Mutter. Both work through XWayland, so prefer the X11 backend on
    // Linux. Set GDK_BACKEND or BETTERBAR_WAYLAND=1 to override and run the bar
    // as a plain Wayland window, which floats and cannot be positioned.
    #[cfg(target_os = "linux")]
    {
        let overridden = std::env::var_os("GDK_BACKEND").is_some()
            || std::env::var_os("BETTERBAR_WAYLAND").is_some();
        if !overridden && std::env::var_os("DISPLAY").is_some() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    betterbar_lib::run()
}
