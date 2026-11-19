/* Requisito 1: navegação atual, data completa dinâmica e contador compartilhado. */
const API_BASE = "https://pokeapi.co/api/v2";
const STORAGE_KEY = "pokecolecao:favorites";
const TYPE_LABELS = {
  normal: "Normal", fire: "Fogo", water: "Água", electric: "Elétrico",
  grass: "Planta", ice: "Gelo", fighting: "Lutador", poison: "Veneno",
  ground: "Terrestre", flying: "Voador", psychic: "Psíquico", bug: "Inseto",
  rock: "Pedra", ghost: "Fantasma", dragon: "Dragão", dark: "Sombrio",
  steel: "Aço", fairy: "Fada"
};
const SEARCH_TYPES = Object.keys(TYPE_LABELS).reduce((types, apiType) => {
  const label = TYPE_LABELS[apiType].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  types[label] = apiType;
  types[apiType] = apiType;
  return types;
}, {});
const TYPE_CLASS = Object.keys(TYPE_LABELS).reduce((classes, type) => {
  classes[type] = `type-${type}`;
  return classes;
}, {});
const detailCache = new Map();
const detailQueue = [];
let activeDetailRequests = 0;
const MAX_DETAIL_REQUESTS = 8;

function readFavorites() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(stored) || stored.some((item) => !item || typeof item.name !== "string")) {
      throw new Error("O formato da coleção salva não é válido.");
    }
    return stored;
  } catch (error) {
    console.error("Não foi possível ler a coleção de favoritos.", error);
    return [];
  }
}

let favorites = readFavorites();

function updateHeader() {
  document.querySelectorAll(".favorite-count").forEach((counter) => {
    counter.textContent = String(favorites.length);
    counter.setAttribute("aria-label", `${favorites.length} Pokémon favoritos`);
  });
  const currentPage = document.body.dataset.page;
  document.querySelectorAll(".main-nav a").forEach((link) => {
    const isCurrent = (currentPage === "index" && link.getAttribute("href") === "index.html")
      || (currentPage === "gallery" && link.getAttribute("href") === "galeria.html")
      || (currentPage === "favorites" && link.getAttribute("href") === "favoritos.html");
    if (isCurrent) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

function setFooterDate() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric"
  }).format(now);
  const dateElement = document.getElementById("current-date");
  if (dateElement) {
    dateElement.dateTime = now.toISOString().slice(0, 10);
    dateElement.textContent = date;
  }
  document.querySelectorAll(".current-year").forEach((year) => {
    year.textContent = String(now.getFullYear());
  });
}

function saveFavorites(nextFavorites) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextFavorites));
  } catch (error) {
    console.error("Não foi possível salvar a coleção de favoritos.", error);
    const status = document.getElementById("favorites-status") || document.getElementById("gallery-status");
    if (status) status.textContent = "Não foi possível salvar sua coleção neste dispositivo. Verifique o espaço disponível.";
    return false;
  }
  favorites = nextFavorites;
  updateHeader();
  return true;
}

/* Requisito 4: detalhes sob demanda reduzem chamadas e trabalho fora da área visível. */
function queuePokemonDetail(url) {
  if (detailCache.has(url)) return detailCache.get(url);
  const promise = new Promise((resolve, reject) => {
    detailQueue.push({ url, resolve, reject });
    processDetailQueue();
  });
  detailCache.set(url, promise);
  return promise;
}

function processDetailQueue() {
  while (activeDetailRequests < MAX_DETAIL_REQUESTS && detailQueue.length) {
    const task = detailQueue.shift();
    activeDetailRequests += 1;
    fetch(task.url)
      .then((response) => {
        if (!response.ok) throw new Error(`A API respondeu com o status ${response.status}.`);
        return response.json();
      })
      .then(task.resolve)
      .catch((error) => {
        detailCache.delete(task.url);
        task.reject(error);
      })
      .finally(() => {
        activeDetailRequests -= 1;
        processDetailQueue();
      });
  }
}

function formatName(name) {
  return name.replace(/-/g, " ");
}

function makeStat(label, value) {
  const wrapper = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = label;
  description.textContent = value;
  wrapper.append(term, description);
  return wrapper;
}

function makeCard(pokemon, options = {}) {
  const card = document.createElement("article");
  card.className = "pokemon-card";
  card.dataset.name = pokemon.name;

  const art = document.createElement("div");
  art.className = "pokemon-art";
  art.setAttribute("aria-label", `Imagem de ${formatName(pokemon.name)}`);
  const placeholder = document.createElement("i");
  placeholder.className = "fa-solid fa-circle-notch fa-spin pokemon-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  art.append(placeholder);

  const heading = document.createElement("h3");
  heading.textContent = formatName(pokemon.name);
  const number = document.createElement("p");
  number.className = "pokemon-number";
  number.textContent = "Carregando dados…";
  const types = document.createElement("div");
  types.className = "pokemon-types";
  types.setAttribute("aria-label", "Tipos");
  const stats = document.createElement("dl");
  stats.className = "pokemon-stats";
  stats.append(
    makeStat("HP", "—"),
    makeStat("Peso", "—"),
    makeStat("Altura", "—"),
    makeStat("Tipo", "—")
  );
  const errorMessage = document.createElement("p");
  errorMessage.className = "card-error";
  errorMessage.hidden = true;
  const action = document.createElement("button");
  action.type = "button";
  const isSaved = favorites.some((favorite) => favorite.name === pokemon.name);
  action.className = `button ${isSaved ? "button-remove" : "button-secondary"}`;
  action.innerHTML = isSaved
    ? '<i class="fa-solid fa-heart-crack" aria-hidden="true"></i> Remover favorito'
    : '<i class="fa-regular fa-heart" aria-hidden="true"></i> Adicionar aos favoritos';
  action.disabled = !pokemon.data;
  action.addEventListener("click", () => {
    const currentlySaved = favorites.some((favorite) => favorite.name === pokemon.name);
    if (currentlySaved) {
      const updated = favorites.filter((favorite) => favorite.name !== pokemon.name);
      if (saveFavorites(updated)) {
        if (options.onRemove) options.onRemove(pokemon.name);
        else renderGalleryFavorites();
      }
      return;
    }
    const savedPokemon = pokemon.data;
    if (!savedPokemon || favorites.some((favorite) => favorite.name === savedPokemon.name)) return;
    if (saveFavorites([...favorites, savedPokemon])) {
      updateCardAction(action, true);
      const status = document.getElementById("gallery-status");
      if (status) status.textContent = `${formatName(savedPokemon.name)} adicionado à sua coleção.`;
      if (document.body.dataset.page === "favorites") renderFavoritesPage();
    }
  });

  card.append(art, heading, number, types, stats, errorMessage, action);
  return { card, art, number, types, stats, errorMessage, action, pokemon };
}

function updateCardAction(button, saved) {
  button.className = `button ${saved ? "button-remove" : "button-secondary"}`;
  button.innerHTML = saved
    ? '<i class="fa-solid fa-heart-crack" aria-hidden="true"></i> Remover favorito'
    : '<i class="fa-regular fa-heart" aria-hidden="true"></i> Adicionar aos favoritos';
}

function fillCard(cardParts, data) {
  const { card, art, number, types, stats, errorMessage, action, pokemon } = cardParts;
  pokemon.data = {
    id: data.id,
    name: data.name,
    hp: data.stats.find((stat) => stat.stat.name === "hp")?.base_stat ?? 0,
    height: data.height,
    weight: data.weight,
    types: data.types.map((entry) => entry.type.name),
    image: data.sprites.other?.["official-artwork"]?.front_default
      || data.sprites.front_default
      || ""
  };
  number.textContent = `#${String(data.id).padStart(4, "0")}`;
  types.replaceChildren();
  pokemon.data.types.forEach((type) => {
    const pill = document.createElement("span");
    pill.className = `type-pill ${TYPE_CLASS[type] || ""}`;
    pill.textContent = TYPE_LABELS[type] || formatName(type);
    types.append(pill);
  });
  stats.replaceChildren(
    makeStat("HP", String(pokemon.data.hp)),
    makeStat("Peso", `${(pokemon.data.weight / 10).toFixed(1)} kg`),
    makeStat("Altura", `${(pokemon.data.height / 10).toFixed(1)} m`),
    makeStat("Tipo", pokemon.data.types.map((type) => TYPE_LABELS[type] || formatName(type)).join(", "))
  );
  if (pokemon.data.image) {
    const image = document.createElement("img");
    image.src = pokemon.data.image;
    image.alt = `Ilustração de ${formatName(pokemon.name)}`;
    image.width = 160;
    image.height = 160;
    image.loading = "lazy";
    image.decoding = "async";
    art.replaceChildren(image);
  } else {
    art.replaceChildren();
    const fallback = document.createElement("span");
    fallback.className = "pokemon-placeholder";
    fallback.textContent = "✦";
    art.append(fallback);
  }
  errorMessage.hidden = true;
  action.disabled = false;
  updateCardAction(action, favorites.some((favorite) => favorite.name === pokemon.name));
}

/* Requisito 3: limit=0 solicita o catálogo completo; busca por nome é local e por tipo usa a API. */
async function initializeGallery() {
  const grid = document.getElementById("pokemon-grid");
  const search = document.getElementById("pokemon-search");
  const clearButton = document.getElementById("clear-search");
  const status = document.getElementById("gallery-status");
  const count = document.getElementById("results-count");
  const title = document.getElementById("results-title");
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      observer.unobserve(entry.target);
      const parts = entry.target.cardParts;
      if (parts.pokemon.data) return;
      queuePokemonDetail(parts.pokemon.url)
        .then((detail) => fillCard(parts, detail))
        .catch((error) => {
          console.error(`Não foi possível carregar ${parts.pokemon.name}.`, error);
          parts.number.textContent = "Dados indisponíveis";
          parts.errorMessage.textContent = "Não foi possível carregar os dados. Recarregue a página para tentar novamente.";
          parts.errorMessage.hidden = false;
          parts.action.disabled = true;
        });
    });
  }, { rootMargin: "400px 0px" });

  let allPokemon = [];
  let requestId = 0;
  function displayPokemon(list, label) {
    grid.replaceChildren();
    title.textContent = label;
    count.textContent = `${list.length} ${list.length === 1 ? "Pokémon" : "Pokémon"}`;
    if (!list.length) {
      status.textContent = "Nenhum Pokémon encontrado. Tente outro nome ou tipo.";
      return;
    }
    status.textContent = "";
    const fragment = document.createDocumentFragment();
    list.forEach((pokemon) => {
      const parts = makeCard(pokemon);
      parts.pokemon.url = pokemon.url;
      parts.card.cardParts = parts;
      fragment.append(parts.card);
      observer.observe(parts.card);
    });
    grid.append(fragment);
  }

  async function searchPokemon(term) {
    const currentRequest = ++requestId;
    const normalized = term.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    clearButton.hidden = !normalized;
    if (!normalized) {
      displayPokemon(allPokemon, "Todos os Pokémon");
      return;
    }
    const apiType = SEARCH_TYPES[normalized];
    if (apiType) {
      status.textContent = "Buscando por tipo…";
      try {
        const response = await fetch(`${API_BASE}/type/${apiType}`);
        if (!response.ok) throw new Error(`A API respondeu com o status ${response.status}.`);
        const result = await response.json();
        if (currentRequest !== requestId) return;
        const found = result.pokemon.map((entry) => ({
          name: entry.pokemon.name,
          url: entry.pokemon.url
        })).filter((pokemon, index, list) => list.findIndex((other) => other.name === pokemon.name) === index);
        displayPokemon(found, `Tipo ${TYPE_LABELS[apiType]}`);
      } catch (error) {
        if (currentRequest !== requestId) return;
        console.error("Não foi possível buscar Pokémon por tipo.", error);
        status.textContent = "Não foi possível carregar este tipo. Verifique sua conexão e tente novamente.";
      }
      return;
    }
    const found = allPokemon.filter((pokemon) => pokemon.name.includes(normalized));
    displayPokemon(found, "Resultados da busca");
  }

  try {
    const response = await fetch(`${API_BASE}/pokemon?limit=0`);
    if (!response.ok) throw new Error(`A API respondeu com o status ${response.status}.`);
    const firstPage = await response.json();
    allPokemon = firstPage.results.map(({ name, url }) => ({ name, url }));
    if (firstPage.next && firstPage.count > firstPage.results.length) {
      const nextPage = new URL(firstPage.next);
      const pageSize = Number(nextPage.searchParams.get("limit")) || firstPage.results.length;
      const pageCount = Math.ceil(firstPage.count / pageSize);
      for (let firstPageNumber = 1; firstPageNumber < pageCount; firstPageNumber += 8) {
        const pages = [];
        for (let pageNumber = firstPageNumber; pageNumber < Math.min(firstPageNumber + 8, pageCount); pageNumber += 1) {
          const pageUrl = new URL(nextPage);
          pageUrl.searchParams.set("offset", String(pageNumber * pageSize));
          pages.push(fetch(pageUrl).then((pageResponse) => {
            if (!pageResponse.ok) throw new Error(`A API respondeu com o status ${pageResponse.status}.`);
            return pageResponse.json();
          }));
        }
        const results = await Promise.all(pages);
        results.forEach((page) => {
          allPokemon.push(...page.results.map(({ name, url }) => ({ name, url })));
        });
      }
    }
    displayPokemon(allPokemon, "Todos os Pokémon");
    if (!allPokemon.length) status.textContent = "A Pokédex não retornou Pokémon.";
    search.addEventListener("input", () => searchPokemon(search.value));
    clearButton.addEventListener("click", () => {
      search.value = "";
      searchPokemon("");
      search.focus();
    });
    document.querySelectorAll(".type-search").forEach((button) => {
      button.addEventListener("click", () => {
        search.value = button.dataset.type;
        searchPokemon(search.value);
        search.focus();
      });
    });
  } catch (error) {
    console.error("Não foi possível carregar a lista completa da Pokédex.", error);
    status.textContent = "Não foi possível carregar a Pokédex. Verifique sua conexão e recarregue a página.";
    title.textContent = "Pokédex indisponível";
  }
}

/* Requisito 5: os favoritos armazenam dados completos, resumo e cards atualizados após cada alteração. */
function updateCollectionSummary() {
  const count = favorites.length;
  document.getElementById("summary-count").textContent = `${count} ${count === 1 ? "Pokémon na sua coleção" : "Pokémon na sua coleção"}`;
  const average = (property) => count
    ? favorites.reduce((total, pokemon) => total + pokemon[property], 0) / count
    : null;
  const weight = average("weight");
  const height = average("height");
  const hp = average("hp");
  document.getElementById("average-weight").textContent = weight === null ? "—" : `${(weight / 10).toFixed(1)} kg`;
  document.getElementById("average-height").textContent = height === null ? "—" : `${(height / 10).toFixed(1)} m`;
  document.getElementById("average-hp").textContent = hp === null ? "—" : hp.toFixed(1);
  const typeList = document.getElementById("collection-types");
  const typeSet = new Set(favorites.flatMap((pokemon) => pokemon.types || []));
  typeList.replaceChildren();
  if (!typeSet.size) {
    const item = document.createElement("li");
    item.className = "muted";
    item.textContent = "Adicione favoritos para ver os tipos.";
    typeList.append(item);
    return;
  }
  typeSet.forEach((type) => {
    const item = document.createElement("li");
    item.textContent = TYPE_LABELS[type] || formatName(type);
    typeList.append(item);
  });
}

function renderFavoritesPage() {
  const grid = document.getElementById("favorites-grid");
  const empty = document.getElementById("favorites-empty");
  const status = document.getElementById("favorites-status");
  updateCollectionSummary();
  grid.replaceChildren();
  empty.hidden = favorites.length > 0;
  if (!favorites.length) return;
  favorites.forEach((pokemon) => {
    const parts = makeCard({ name: pokemon.name, data: pokemon }, {
      onRemove: (name) => {
        status.textContent = `${formatName(name)} removido da sua coleção.`;
        renderFavoritesPage();
      }
    });
    fillCard(parts, {
      id: pokemon.id,
      name: pokemon.name,
      height: pokemon.height,
      weight: pokemon.weight,
      stats: [{ stat: { name: "hp" }, base_stat: pokemon.hp }],
      types: pokemon.types.map((type) => ({ type: { name: type } })),
      sprites: { other: { "official-artwork": { front_default: pokemon.image } }, front_default: pokemon.image }
    });
    grid.append(parts.card);
  });
}

function renderGalleryFavorites() {
  document.querySelectorAll("#pokemon-grid .pokemon-card").forEach((card) => {
    const button = card.querySelector("button");
    if (button) updateCardAction(button, favorites.some((favorite) => favorite.name === card.dataset.name));
  });
}

/* Requisito 5: storage events mantêm o contador sincronizado entre abas e páginas. */
window.addEventListener("storage", (event) => {
  if (event.key !== STORAGE_KEY) return;
  favorites = readFavorites();
  updateHeader();
  if (document.body.dataset.page === "favorites") renderFavoritesPage();
  else renderGalleryFavorites();
});

document.addEventListener("DOMContentLoaded", () => {
  setFooterDate();
  updateHeader();
  if (document.body.dataset.page === "gallery") initializeGallery();
  if (document.body.dataset.page === "favorites") renderFavoritesPage();
});
