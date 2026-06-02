# Build and Install BetterBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and install the latest version of BetterBar from source.

**Architecture:** Standard Tauri v2 build process. Frontend (React) is built via Vite, then bundled into a macOS application by the Tauri CLI.

**Tech Stack:** Node.js, npm, Rust, Tauri v2.

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package-lock.json` (indirectly via npm install)

- [ ] **Step 1: Install frontend dependencies**

Run: `npm install`
Expected: Successful installation of all Node.js dependencies.

- [ ] **Step 2: Commit**

```bash
git add package-lock.json
git commit -m "chore: update dependencies"
```

### Task 2: Build the Application

**Files:**
- Create: `src-tauri/target/release/bundle/macos/BetterBar.app` (and .dmg)

- [ ] **Step 1: Run Tauri build**

Run: `npm run tauri build`
Expected: Successful build of both frontend and backend, resulting in a `.app` bundle and `.dmg` in `src-tauri/target/release/bundle/macos/`.

- [ ] **Step 2: Verify build artifacts**

Run: `ls -lh src-tauri/target/release/bundle/macos/`
Expected: Presence of `BetterBar.app` and `BetterBar_0.7.0_x64.dmg` (or similar depending on architecture).

### Task 3: Install the Application

**Files:**
- Create: `/Applications/BetterBar.app`

- [ ] **Step 1: Copy to Applications folder**

Run: `cp -R src-tauri/target/release/bundle/macos/BetterBar.app /Applications/`
Expected: `BetterBar.app` is now available in the system Applications folder.

- [ ] **Step 2: Remove quarantine attribute (optional but recommended for local builds)**

Run: `xattr -d com.apple.quarantine /Applications/BetterBar.app`
Expected: Successful removal of the quarantine attribute to allow the app to run.

- [ ] **Step 3: Launch the application**

Run: `open /Applications/BetterBar.app`
Expected: BetterBar launches successfully.
