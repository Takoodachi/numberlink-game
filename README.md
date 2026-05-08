# 🔗 Number Link - Logic & Vocabulary Puzzle Game

A high-fidelity, responsive HTML5 and Native Android implementation of the classic Number Link / Flow logic puzzle—now expanded with a premium visual design and multiple unique game modes, including Speedruns, Blindfold challenges, and a Dictionary-powered Vocabulary mode!

## 🎮 Game Modes

* **Classic (Number Link):** Connect the numbers in sequence (1 → 2 → 3...) to fill the entire grid without crossing lines.
* **Connecting Letters (Words):** Connect the highlighted start and end letters to spell a valid dictionary word. Features a built-in dictionary that allows you to look up the definition of the word after beating the level using the "Show Answer" button!
* **Speedrun:** Race against the clock! The timer starts the moment you interact with the grid. Compete against your own Best Times saved to the cloud.
* **Optimal Path:** Forget filling the grid—your goal is to connect the numbers in sequence using the *fewest tiles possible*. Tracks your most efficient routes.
* **Blindfold:** A true memory and logic test. Numbers are hidden and are only revealed as you successfully connect them in the correct order.

## ✨ Features

### Premium UI & Aesthetics
* **High-Fidelity Landing Page:** A modernized entry experience featuring a dynamic "snake-like" interactive background where colored grid boxes follow the cursor in a chain.
* **3D Perspective Carousel:** An immersive 3D carousel for selecting game modes, complete with click-to-select side cards, intuitive visual indicators, and seamless transitions into the game.
* **Modern Design Language:** Utilizes the "Outfit" typography, sleek glassmorphism effects for modals and sidebars, smooth dynamic gradients, and polished micro-animations for buttons and interactive elements.
* **Themes:** Built-in Dark Mode 🌙 and Light Mode ☀️ toggled via a professional Floating Action Button (FAB), complete with custom-themed scrollbars and dynamic favicons.

### Gameplay & Mechanics
* **Dynamic Grid System:** Loads levels dynamically from obfuscated `.enc` files (`levels.enc` and `word_levels.enc`), utilizing Base64 encoding to prevent players from easily looking up solutions via browser developer tools.
* **Dual Input Support:**
    * **Mouse/Touch:** Drag to draw lines. Supports backtracking (scrubbing back) to correct mistakes dynamically.
    * **Keyboard:** Use **Arrow Keys** to draw lines precisely from your current position.
* **Smart Mechanics:**
    * Flexible connecting mechanism allowing players to link nodes dynamically.
    * Tile "Snatch" scale animation when connecting nodes.
    * Dynamic line width animation while drawing.
    * Auto-detection of starting nodes if no line exists.
* **Dynamic Rules System:** A dedicated rules modal that automatically updates its instructions and icons based on the currently active game mode.

### ☁️ Accounts & Cloud Sync (Powered by Firebase)
* **Authentication:** Seamless modal using Firebase Email & Password authentication. Includes email verification and a secure Password Reset system.
* **Cross-Platform Sync:** Player progress (current levels across all modes, max unlocked levels, best speedrun times, optimal scores, daily login streaks, and hints) is saved simultaneously to `localStorage` and Firebase Firestore.
* **Smart Conflict Resolution:** If local and cloud saves differ, a custom UI prompts the player to choose which save file to keep.
* **Player Profile:** Dedicated dashboard displaying player stats, current level, and account management options (like changing email addresses securely).
* **Developer Mode:** Logging in with a designated admin email automatically unlocks all levels, prints valid words to the console, grants infinite hints, and bypasses "Show Answer" restrictions.

### UX Enhancements
* **Responsive Layout:** Resizing canvas that adapts to any screen size, centered via dynamic viewport height (`dvh`).
* **Mobile Optimized:**
    * Touch event support with `touch-action: none` to prevent native browser bouncing and scrolling.
    * **Portrait Mode Lock:** Forces mobile users to rotate their device for the best experience.
* **Leaderboards & Tracking:** A slide-out leaderboard panel to track Daily Streaks and Speedrun times.
* **Dynamic Toast Notifications:** A custom flexbox container dynamically stacks multiple alerts without overlapping.
* **Visual Polish:**
    * Premium "Level Complete" card UI that scales cleanly across all modes.
    * Confetti celebration on level completion 🎉.
* **Review Mode:** "Show Answer" button appears for previously completed levels, dynamically drawing the solution or revealing the dictionary definition depending on the mode.

## 📱 Mobile App Version (Android)

This game is packaged as a native Android application using **Capacitor**. It features device-specific optimizations:
* True fullscreen immersive mode by interacting directly with the Android Status Bar API.
* Safe-area inset handling to dodge notches and OS gesture bars.
* Custom native app icon and splash screen generation.

**Note:** The mobile version codebase is maintained separately. **Please check out the `mobile` branch** to view the Android-specific code, and visit the **Releases** tab to download the compiled `.apk` file!

## 🚀 How to Run Locally

Because this game fetches level data from external `.enc` files, modern browsers may block the request if you simply double-click `index.html` due to **CORS (Cross-Origin Resource Sharing)** policies.

To run the web version locally, you need a local web server.

### Option 1: VS Code (Recommended)
1.  Install the **Live Server** extension in VS Code.
2.  Right-click `index.html` and select **"Open with Live Server"**.

### Option 2: Python
If you have Python installed, open your terminal in the project folder and run:
```bash
# Python 3
python -m http.server 8000