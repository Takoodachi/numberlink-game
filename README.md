# 🔗 Number Link - Logic Puzzle Game

A modern, responsive HTML5 implementation of the classic Number Link / Flow logic puzzle. Connect the numbers in sequence to fill the grid without crossing lines!

## 🎮 Features

### Gameplay
* **Dynamic Grid System:** Loads levels dynamically from a JSON file.
* **Dual Input Support:**
    * **Mouse/Touch:** Drag to draw lines. Supports backtracking (scrubbing back) to correct mistakes.
    * **Keyboard:** Use **Arrow Keys** to draw lines precisely from your current position.
* **Smart Mechanics:**
    * "Snatch" animation when connecting nodes.
    * Dynamic line width animation while drawing.
    * Auto-detection of "1" as the starting point if no line exists.
* **Win Validation:** Ensures the grid is full AND numbers are connected in the correct numerical order (1 → 2 → 3...).

### UI & UX
* **Themes:** Built-in Dark Mode 🌙 and Light Mode ☀️ toggle.
* **Responsive Design:** resizing canvas that adapts to any screen size.
* **Mobile Optimized:**
    * Touch event support.
    * **Portrait Mode Lock:** Forces mobile users to rotate their device for the best experience.
* **Progress System:**
    * Saves unlocked levels and current progress to `localStorage`.
    * "Daily Hint" system (hints regenerate every 24 hours).
* **Visual Polish:**
    * Confetti celebration on level completion 🎉.
    * Smooth CSS transitions for UI elements.
* **Review Mode:** "Show Answer" button appears for previously completed levels.

## 🚀 How to Run Locally

Because this game fetches level data from an external `levels.json` file, modern browsers may block the request if you simply double-click `index.html` due to **CORS (Cross-Origin Resource Sharing)** policies.

To run it locally, you need a local web server.

### Option 1: VS Code (Recommended)
1.  Install the **Live Server** extension in VS Code.
2.  Right-click `index.html` and select **"Open with Live Server"**.

### Option 2: Python
If you have Python installed, open your terminal in the project folder and run:
```bash
# Python 3
python -m http.server 8000
