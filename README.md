# Nothing to Read ✦

A lightweight, premium illustrated media discovery wall powered by AniList's public GraphQL API.

**Nothing to Read** transforms your screen into a rich, full-screen mosaic of manga, manhwa, manhua, and light novel covers. Hover or click any poster to reveal a dynamic, 3D-tilting detail card displaying synopses, scores, genres, and interactive external resource links.

---

## Key Features

- ✦ **Dynamic Categories**: Effortlessly switch between Japanese **Manga**, Korean **Manhwa**, Chinese **Manhua**, and global **Light Novels** (`NOVEL` format) via the floating header bar.
- ↻ **Double-Randomized Discovery**:
  - **Dynamic Page Sampling**: Every category load samples page 1 (for trending hits) plus three randomized pages from AniList's database.
  - **Fisher-Yates Shuffle**: Wall arrangements are fully randomized using a robust shuffle algorithm on load or by clicking the **Shuffle** button.
- 🗃 **Persisted Favorite System**: Save titles you discover directly to browser `localStorage` using the detail card's Heart button. View, manage, or clear them inside a dedicated grid modal.
- 👁 **Smart Card Controls**: The detail card automatically closes and remains closed when dismissed, ignoring accidental mouseovers on tiles underneath until a new tile is clicked.
- ☾ **Sleek Light/Dark Mode**: Smooth custom-theme transitions via CSS custom properties.
- 🎨 **Premium Glassmorphic Design**: Frosted glass panels, springy animations, custom circular score indicators, and a pointer-tracked 3D card tilt effect.

---

## File Structure

```
ZeroChapters/
├── index.html            # Main markup including header, modals, and container shells
├── layout.css            # Styling, responsive grid layout, custom transitions, and themes
├── reader-discovery.js   # Application logic, AniList API interface, and interaction handlers
└── README.md             # Project documentation
```

---

## Technical Details

### GraphQL Integration
The application queries the AniList API directly from the client. It filters media by `type: MANGA` and adapts variables based on the active category:
- **Manga**: JP origin + `format: MANGA`
- **Manhwa**: KR origin + `format: MANGA`
- **Manhua**: CN origin + `format: MANGA`
- **Light Novels**: Global origin + `format: NOVEL`

### Double-Randomization Pipeline
```js
// 1. Pages are selected randomly from top trending lists
const getRandomPages = () => {
  const pages = new Set([1]); // Always include Page 1 for quality base list
  while (pages.size < 4) {
    pages.add(Math.floor(Math.random() * 10) + 2); // Sample random pages 2..11
  }
  return [...pages];
};

// 2. Fetched items are deduplicated and randomized using Fisher-Yates
const shuffleArray = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};
```

---

## Quick Start

No build step or dependencies required. Simply serve or open the project files:

1. **Directly**: Double-click [index.html](file:///d:/ZeroChapters/index.html) to open it in your browser.
2. **VS Code Live Server**: Right-click [index.html](file:///d:/ZeroChapters/index.html) and select **Open with Live Server**.
3. **Command Line**: Serve the directory using Python or static server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js
   npx serve
   ```
