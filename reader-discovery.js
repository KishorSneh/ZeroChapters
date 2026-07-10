/*
  Nothing to Read
  A native JavaScript cover-wall interface powered by AniList's public GraphQL API.
  Featuring dynamic categories (Manga, Manhwa, Manhua, Light Novels),
  randomized discovery walls on every refresh, and polished interactive controls.
*/

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const WALL_TILE_COUNT = 1800;
const DETAIL_CHANGE_MS = 280;

const CATEGORY_CONFIG = {
  MANGA: {
    label: "Manga",
    countryOfOrigin: "JP",
    format: "MANGA",
  },
  MANHWA: {
    label: "Manhwa",
    countryOfOrigin: "KR",
    format: "MANGA",
  },
  MANHUA: {
    label: "Manhua",
    countryOfOrigin: "CN",
    format: "MANGA",
  },
  NOVEL: {
    label: "Light Novels",
    countryOfOrigin: null,
    format: "NOVEL",
  },
};

const MEDIA_QUERY = `
  query ReadDiscovery($countryOfOrigin: CountryCode, $format: MediaFormat, $page: Int) {
    Page(page: $page, perPage: 50) {
      media(
        type: MANGA,
        countryOfOrigin: $countryOfOrigin,
        format: $format,
        sort: [TRENDING_DESC, POPULARITY_DESC, SCORE_DESC],
        isAdult: false
      ) {
        id
        idMal
        title {
          english
          romaji
          native
        }
        coverImage {
          extraLarge
          large
        }
        genres
        description(asHtml: false)
        averageScore
        startDate {
          year
        }
        siteUrl
      }
    }
  }
`;

const state = {
  category: "MANHWA",
  records: [],
  selectedRecord: null,
  requestId: 0,
  detailTimer: null,
  isCardClosed: false,
  favorites: new Map(),
};

window.readerDiscoveryState = state;

const dom = {
  shell: document.querySelector(".app-shell"),
  grid: document.querySelector("[data-grid]"),
  detail: document.querySelector("[data-detail]"),
  backdrop: document.querySelector("[data-detail-backdrop]"),
  title: document.querySelector("[data-detail-title]"),
  subtitle: document.querySelector("[data-detail-subtitle]"),
  score: document.querySelector("[data-detail-score]"),
  genres: document.querySelector("[data-detail-genres]"),
  description: document.querySelector("[data-detail-description]"),
  link: document.querySelector("[data-detail-link]"),
  malBtn: document.querySelector("[data-mal]"),
  next: document.querySelector("[data-next]"),
  favoriteBtn: document.querySelector("[data-favorite]"),
  close: document.querySelector("[data-close]"),
  shuffle: document.querySelector("[data-shuffle]"),
  themeToggle: document.querySelector("[data-theme-toggle]"),
  infoToggle: document.querySelector("[data-info]"),
  infoModal: document.querySelector("[data-info-modal]"),
  infoClose: document.querySelector("[data-info-close]"),
  favoritesToggle: document.querySelector("[data-favorites-toggle]"),
  favoritesModal: document.querySelector("[data-favorites-modal]"),
  favoritesClose: document.querySelector("[data-favorites-close]"),
  favoritesClear: document.querySelector("[data-favorites-clear]"),
  favoritesGrid: document.querySelector("[data-favorites-grid]"),
  favoritesCount: document.querySelector("[data-favorites-count]"),
  settingsToggle: document.querySelector("[data-settings-toggle]"),
  settingsPanel: document.querySelector("[data-settings-panel]"),
  categoryButtons: [
    ...document.querySelectorAll("[data-category]"),
    ...document.querySelectorAll("[data-category-opt]"),
  ],
  status: document.querySelector("[data-status]"),
};

const stripHtml = (value = "") => {
  const parser = new DOMParser();
  return parser.parseFromString(value, "text/html").documentElement.textContent.trim();
};

const truncate = (value, maxLength) => {
  if (!value) {
    return "No synopsis available.";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength).trim()}...` : value;
};

const getTitle = (title = {}) => title.english || title.romaji || title.native || "Untitled";

const getYearText = (record) => (record.startDate?.year ? `(${record.startDate.year})` : "");

const setStatus = (message = "") => {
  if (!dom.status) return;
  dom.status.hidden = !message;
  dom.status.textContent = message;
};

const shuffleArray = (items) => {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const getRandomPages = () => {
  const pages = new Set([1]);
  while (pages.size < 4) {
    pages.add(Math.floor(Math.random() * 10) + 2); // Random sample across top pages 2..11
  }
  return [...pages];
};

const loadFavorites = () => {
  try {
    const raw = localStorage.getItem("ntr_favorites");
    if (raw) {
      const parsed = JSON.parse(raw);
      state.favorites = new Map(parsed.map((item) => [item.id, item]));
    }
  } catch (error) {
    console.error("Failed to load favorites", error);
  }
  updateFavoritesCount();
};

const saveFavorites = () => {
  try {
    const items = [...state.favorites.values()];
    localStorage.setItem("ntr_favorites", JSON.stringify(items));
  } catch (error) {
    console.error("Failed to save favorites", error);
  }
  updateFavoritesCount();
};

const updateFavoritesCount = () => {
  if (dom.favoritesCount) {
    dom.favoritesCount.textContent = String(state.favorites.size);
  }
};

const toggleFavorite = (record) => {
  if (!record || !record.id) return;

  if (state.favorites.has(record.id)) {
    state.favorites.delete(record.id);
  } else {
    state.favorites.set(record.id, record);
  }

  saveFavorites();
  updateFavoriteButtonState(record);
  renderFavoritesModal();
};

const updateFavoriteButtonState = (record) => {
  if (!dom.favoriteBtn || !record) return;
  const isFav = state.favorites.has(record.id);
  dom.favoriteBtn.classList.toggle("is-favorited", isFav);
  dom.favoriteBtn.title = isFav ? "Saved to Favorites" : "Favorite";
};

const renderFavoritesModal = () => {
  if (!dom.favoritesGrid) return;

  const items = [...state.favorites.values()];
  dom.favoritesGrid.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "favorites-empty";
    empty.textContent = "No favorites saved yet. Click ♥ on any cover to save titles!";
    dom.favoritesGrid.append(empty);
    return;
  }

  items.forEach((record) => {
    const card = document.createElement("div");
    card.className = "favorite-item";

    const img = document.createElement("img");
    img.src = record.coverImage?.large || record.coverImage?.extraLarge || "";
    img.alt = getTitle(record.title);

    const title = document.createElement("div");
    title.className = "favorite-item-title";
    title.textContent = getTitle(record.title);

    const removeBtn = document.createElement("button");
    removeBtn.className = "favorite-item-remove";
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", "Remove from favorites");
    removeBtn.innerHTML = "&times;";

    removeBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      state.favorites.delete(record.id);
      saveFavorites();
      renderFavoritesModal();
      if (state.selectedRecord && state.selectedRecord.id === record.id) {
        updateFavoriteButtonState(record);
      }
    });

    card.append(img, title, removeBtn);

    card.addEventListener("click", () => {
      dom.favoritesModal.hidden = true;
      renderDetail(record, true);
    });

    dom.favoritesGrid.append(card);
  });
};

const pulseDetailCard = () => {
  window.clearTimeout(state.detailTimer);
  dom.detail.classList.remove("is-changing");

  requestAnimationFrame(() => {
    dom.detail.classList.add("is-changing");
    state.detailTimer = window.setTimeout(() => {
      dom.detail.classList.remove("is-changing");
    }, DETAIL_CHANGE_MS);
  });
};

const fetchAniListPage = async ({ categoryKey, page }) => {
  const config = CATEGORY_CONFIG[categoryKey] || CATEGORY_CONFIG.MANHWA;
  const variables = { page };

  if (config.countryOfOrigin) {
    variables.countryOfOrigin = config.countryOfOrigin;
  }
  if (config.format) {
    variables.format = config.format;
  }

  const response = await fetch(ANILIST_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      query: MEDIA_QUERY,
      variables,
    }),
  });

  if (!response.ok) {
    throw new Error(`AniList request failed with ${response.status}`);
  }

  const payload = await response.json();

  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join(", "));
  }

  return payload.data.Page.media;
};

const dedupeRecords = (records) => {
  const byId = new Map();
  records.filter(Boolean).forEach((record) => byId.set(record.id, record));
  return [...byId.values()];
};

const renderSkeleton = () => {
  dom.grid.replaceChildren(
    ...Array.from({ length: WALL_TILE_COUNT }, () => {
      const tile = document.createElement("div");
      tile.className = "skeleton-tile";
      return tile;
    }),
  );
};

const renderDetail = (record, forceOpen = false) => {
  if (!record) {
    return;
  }

  if (forceOpen) {
    state.isCardClosed = false;
  }

  if (state.isCardClosed) {
    return;
  }

  state.selectedRecord = record;
  pulseDetailCard();
  dom.detail.classList.remove("is-hidden");
  dom.title.textContent = `${getTitle(record.title)} ${getYearText(record)}`.trim();
  dom.subtitle.textContent = record.title?.native || record.title?.romaji || "Nothing to Read";
  dom.description.textContent = truncate(stripHtml(record.description), 360);
  dom.backdrop.style.backgroundImage = `url("${record.coverImage?.extraLarge || record.coverImage?.large || ""}")`;
  dom.link.href = record.siteUrl || "#";
  dom.genres.replaceChildren();

  (record.genres || []).slice(0, 3).forEach((genre) => {
    const item = document.createElement("li");
    item.className = "genre-pill";
    item.textContent = genre;
    dom.genres.append(item);
  });

  const score = record.averageScore || 0;
  dom.score.style.setProperty("--score-angle", `${score * 3.6}deg`);
  dom.score.querySelector("span").textContent = score ? `${score}%` : "--";

  updateFavoriteButtonState(record);
};

const createTile = (record, index) => {
  const tile = document.createElement("button");
  const image = document.createElement("img");

  tile.className = "poster-tile";
  tile.type = "button";
  tile.dataset.recordIndex = String(index % state.records.length);
  tile.setAttribute("aria-label", getTitle(record.title));

  image.src = record.coverImage?.large || record.coverImage?.extraLarge || "";
  image.alt = "";
  image.loading = index < 140 ? "eager" : "lazy";

  tile.append(image);

  tile.addEventListener("mouseenter", () => {
    if (state.isCardClosed) {
      return;
    }
    renderDetail(record);
  });

  tile.addEventListener("focus", () => {
    if (state.isCardClosed) {
      return;
    }
    renderDetail(record);
  });

  tile.addEventListener("click", () => {
    renderDetail(record, true);
  });

  return tile;
};

const renderWall = () => {
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < WALL_TILE_COUNT; index += 1) {
    const record = state.records[index % state.records.length];
    fragment.append(createTile(record, index));
  }

  dom.grid.replaceChildren(fragment);
  if (!state.isCardClosed && state.records.length) {
    renderDetail(state.records[0], true);
  }
};

const loadWall = async () => {
  const requestId = state.requestId + 1;
  const categoryConfig = CATEGORY_CONFIG[state.category] || CATEGORY_CONFIG.MANHWA;

  state.requestId = requestId;
  dom.shell.setAttribute("aria-busy", "true");
  renderSkeleton();

  if (!state.isCardClosed) {
    renderDetail({
      title: { english: categoryConfig.label },
      description: `Loading ${categoryConfig.label.toLowerCase()} into the wall...`,
      genres: ["Discovery"],
      coverImage: {},
      averageScore: 0,
      startDate: {},
      siteUrl: "#",
    }, true);
  }

  try {
    const pagesToFetch = getRandomPages();
    const pageResults = await Promise.allSettled(
      pagesToFetch.map((page) => fetchAniListPage({ categoryKey: state.category, page })),
    );

    const records = dedupeRecords(
      pageResults
        .filter((result) => result.status === "fulfilled")
        .flatMap((result) => result.value),
    );

    if (!records.length) {
      throw new Error("AniList returned no readable records.");
    }

    if (requestId !== state.requestId) {
      return;
    }

    // Randomize order on each refresh
    state.records = shuffleArray(records);
    renderWall();
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("AniList could not be reached right now.");
  } finally {
    dom.shell.setAttribute("aria-busy", "false");
  }
};

const shuffleWall = () => {
  if (!state.records.length) {
    return;
  }
  state.records = shuffleArray(state.records);
  renderWall();
};

const selectRelativeRecord = (offset) => {
  if (!state.records.length) {
    return;
  }

  const currentIndex = Math.max(0, state.records.findIndex((record) => record.id === state.selectedRecord?.id));
  const nextIndex = (currentIndex + offset + state.records.length) % state.records.length;

  renderDetail(state.records[nextIndex], true);
};

const setSettingsOpen = (isOpen) => {
  dom.settingsPanel.hidden = !isOpen;
  dom.settingsToggle.setAttribute("aria-expanded", String(isOpen));
};

const setCategory = (categoryKey) => {
  if (!CATEGORY_CONFIG[categoryKey]) {
    return;
  }

  const isSameCategory = state.category === categoryKey;
  state.category = categoryKey;
  state.isCardClosed = false;

  dom.categoryButtons.forEach((button) => {
    const btnKey = button.dataset.category || button.dataset.categoryOpt;
    button.classList.toggle("is-active", btnKey === categoryKey);
  });

  setSettingsOpen(false);

  if (isSameCategory) {
    // If clicking same category, randomize & refresh wall
    loadWall();
  } else {
    state.records = [];
    state.selectedRecord = null;
    loadWall();
  }
};

// Event Listeners for All Buttons
dom.next?.addEventListener("click", () => selectRelativeRecord(1));

dom.close?.addEventListener("click", () => {
  state.isCardClosed = true;
  dom.detail.classList.add("is-hidden");
});

dom.shuffle?.addEventListener("click", () => {
  shuffleWall();
});

dom.malBtn?.addEventListener("click", () => {
  const rec = state.selectedRecord;
  if (!rec) return;

  if (rec.idMal) {
    window.open(`https://myanimelist.net/manga/${rec.idMal}`, "_blank", "noopener,noreferrer");
  } else {
    const query = encodeURIComponent(getTitle(rec.title));
    window.open(`https://myanimelist.net/manga.php?q=${query}`, "_blank", "noopener,noreferrer");
  }
});

dom.favoriteBtn?.addEventListener("click", () => {
  if (state.selectedRecord) {
    toggleFavorite(state.selectedRecord);
  }
});

dom.infoToggle?.addEventListener("click", () => {
  if (dom.infoModal) dom.infoModal.hidden = false;
});

dom.infoClose?.addEventListener("click", () => {
  if (dom.infoModal) dom.infoModal.hidden = true;
});

dom.favoritesToggle?.addEventListener("click", () => {
  renderFavoritesModal();
  if (dom.favoritesModal) dom.favoritesModal.hidden = false;
});

dom.favoritesClose?.addEventListener("click", () => {
  if (dom.favoritesModal) dom.favoritesModal.hidden = true;
});

dom.favoritesClear?.addEventListener("click", () => {
  state.favorites.clear();
  saveFavorites();
  renderFavoritesModal();
  if (state.selectedRecord) {
    updateFavoriteButtonState(state.selectedRecord);
  }
});

dom.infoModal?.addEventListener("click", (event) => {
  if (event.target === dom.infoModal) {
    dom.infoModal.hidden = true;
  }
});

dom.favoritesModal?.addEventListener("click", (event) => {
  if (event.target === dom.favoritesModal) {
    dom.favoritesModal.hidden = true;
  }
});

let isDarkTheme = false;
dom.themeToggle?.addEventListener("click", () => {
  isDarkTheme = !isDarkTheme;
  document.documentElement.setAttribute("data-theme", isDarkTheme ? "dark" : "light");
});

const updateCardTilt = (event) => {
  const bounds = dom.detail.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;

  dom.detail.style.setProperty("--tilt-x", `${(-y * 4).toFixed(2)}deg`);
  dom.detail.style.setProperty("--tilt-y", `${(x * 5).toFixed(2)}deg`);
};

const resetCardTilt = () => {
  dom.detail.style.setProperty("--tilt-x", "0deg");
  dom.detail.style.setProperty("--tilt-y", "0deg");
};

dom.detail?.addEventListener("pointermove", updateCardTilt);
dom.detail?.addEventListener("pointerleave", resetCardTilt);

dom.settingsToggle?.addEventListener("click", () => {
  setSettingsOpen(dom.settingsPanel.hidden);
});

dom.categoryButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.category || button.dataset.categoryOpt;
    setCategory(key);
  });
});

document.addEventListener("click", (event) => {
  if (
    dom.settingsPanel.hidden
    || dom.settingsPanel.contains(event.target)
    || dom.settingsToggle.contains(event.target)
  ) {
    return;
  }

  setSettingsOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSettingsOpen(false);
    if (dom.infoModal) dom.infoModal.hidden = true;
    if (dom.favoritesModal) dom.favoritesModal.hidden = true;
  }
});

loadFavorites();
loadWall();


