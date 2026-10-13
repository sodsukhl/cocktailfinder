const API_URL = "https://www.thecocktaildb.com/api/json/v1/1";

// Ingredients we assume everyone has, so they never count as "missing"
const ALWAYS_HAVE = ["ice", "water"];

// label = what the user sees, value = the database's name for it
const POPULAR = [
  { label: "Gin", value: "gin" },
  { label: "Vodka", value: "vodka" },
  { label: "Rum", value: "light rum" },
  { label: "Tequila", value: "tequila" },
  { label: "Whiskey", value: "bourbon" },
  { label: "Lemon", value: "lemon juice" },
  { label: "Lime", value: "lime juice" },
  { label: "Orange", value: "orange juice" },
  { label: "Sugar", value: "sugar" },
  { label: "Mint", value: "mint" },
  { label: "Tonic Water", value: "tonic water" },
  { label: "Coke", value: "coca-cola" },
  { label: "Cranberry Juice", value: "cranberry juice" },
  { label: "Pineapple Juice", value: "pineapple juice" },
  { label: "Ginger Beer", value: "ginger beer" },
];

// Grab the page elements we need
const input = document.getElementById("ingredient-input");
const addButton = document.getElementById("add-button");
const clearButton = document.getElementById("clear-button");
const chipsDiv = document.getElementById("chips");
const statusText = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const suggestionsList = document.getElementById("suggestions");
const searchBox = input.parentElement;
const toggleButton = document.getElementById("toggle-suggestions");
const categorySelect = document.getElementById("category-select");
const glassSelect = document.getElementById("glass-select");
const exactToggle = document.getElementById("exact-toggle");
const popularGrid = document.getElementById("popular-grid");
const dialog = document.getElementById("drink-dialog");
const loader = document.getElementById("loader");
const loaderText = loader.querySelector(".loader-text");
const retryButton = document.getElementById("retry-button");

// Our data lives in these variables
let allDrinks = [];          // every cocktail from the API
let knownIngredients = [];   // every ingredient name that exists
let selected = [];           // ingredients the user has chosen
let filters = { type: "all", category: "all", glass: "all", sort: "best", exact: false };
// ---------- 1. LOADING DATA FROM THE API ----------

// Ask the API for all drinks starting with one letter. Tries twice.
async function fetchLetter(character) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await fetch(`${API_URL}/search.php?f=${character}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return data.drinks || [];
    } catch (error) {
      console.log(`Letter ${character} failed (attempt ${attempt})`, error);
    }
  }
  return [];
}

// Load all drinks by asking for each starting letter (a-z, 0-9)
async function loadAllDrinks() {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789".split("");
  const lists = await Promise.all(characters.map(fetchLetter)); // 36 requests at once
  return lists.flat();                                          // merge into one big list
}

// Gather strIngredient1...15 into one clean list for a drink
function getIngredients(drink) {
  const list = [];
  for (let i = 1; i <= 15; i++) {
    const name = drink[`strIngredient${i}`];
    if (name && name.trim() !== "") {
      const clean = name.trim().toLowerCase();
      if (!list.includes(clean)) {
        list.push(clean);
      }
    }
  }
  return list;
}

// ---------- 2. MATCHING, FILTERING AND SORTING ----------

function findMatches() {
  const have = [...selected, ...ALWAYS_HAVE];

  // Step 1: score every drink against the user's ingredients
  let results = allDrinks
    .map((drink) => {
      const missing = drink.ingredients.filter((ing) => !have.includes(ing));
      const matchedCount = drink.ingredients.filter((ing) =>
        selected.includes(ing)
      ).length;
      return { drink, missing, matchedCount };
    })
    .filter((result) => result.matchedCount > 0);

  // Step 2: apply the filters
  results = results.filter(({ drink, missing }) => {
    // "Only my ingredients": drop any drink that needs something else
    if (filters.exact && missing.length > 0) {
      return false;
    }    if (filters.type === "alcoholic" && drink.strAlcoholic !== "Alcoholic") {
      return false;
    }
    if (filters.type === "non-alcoholic" && drink.strAlcoholic === "Alcoholic") {
      return false;
    }
    if (filters.category !== "all" && drink.strCategory !== filters.category) {
      return false;
    }
    if (filters.glass !== "all" && drink.strGlass !== filters.glass) {
      return false;
    }
    return true;
  });

  // Step 3: sort
  if (filters.sort === "az") {
    results.sort((a, b) => a.drink.strDrink.localeCompare(b.drink.strDrink));
  } else if (filters.sort === "za") {
    results.sort((a, b) => b.drink.strDrink.localeCompare(a.drink.strDrink));
  } else {
    results.sort(
      (a, b) =>
        a.missing.length - b.missing.length ||
        b.matchedCount - a.matchedCount
    );
  }

  return results;
}

// ---------- 3. SHOWING THINGS ON THE PAGE ----------

function showChips() {
  chipsDiv.innerHTML = selected
    .map(
      (name) => `
        <span class="chip">
          ${name}
          <button class="remove-chip" data-name="${name}">×</button>
        </span>`
    )
    .join("");
}

function showPopular() {
  popularGrid.innerHTML = POPULAR
    .filter((item) => knownIngredients.includes(item.value))
    .map((item) => {
      const isSelected = selected.includes(item.value);
      return `
        <button class="popular-item ${isSelected ? "selected" : ""}"
                data-name="${item.value}">
          <img src="https://www.thecocktaildb.com/images/ingredients/${encodeURIComponent(item.value)}-Small.png"
               alt="" width="24" onerror="this.style.display='none'">
          ${item.label}
        </button>`;
    })
    .join("");
}

function showResults() {
  // Nothing selected yet: show a friendly prompt
  if (selected.length === 0) {
    statusText.textContent = "";
    resultsDiv.innerHTML = `
      <p class="empty-state">
        Pick the ingredients you have at home, and we'll show you
        cocktails you can make (or almost make).
      </p>`;
    return;
  }

  const matches = findMatches();

    // Nothing matched: explain why and what to try
  if (matches.length === 0) {
    const filtersActive =
      filters.type !== "all" ||
      filters.category !== "all" ||
      filters.glass !== "all";

    let message =
      "No cocktails found with those ingredients. Try removing one, or adding another.";

    if (filters.exact) {
      message =
        "No cocktails can be made using only these ingredients. Try adding more, or switch off “Only my ingredients”.";
    } else if (filtersActive) {
      message =
        "No cocktails match these ingredients with your current filters. Try changing or resetting a filter.";
    }

    statusText.textContent = "";
    resultsDiv.innerHTML = `<p class="empty-state">${message}</p>`;
    return;
  }

  // Show the count (and mention it if we're cutting the list off)
  const word = matches.length === 1 ? "cocktail" : "cocktails";
  statusText.textContent =
    matches.length > 50
      ? `${matches.length} ${word} found (showing the best 50)`
      : `${matches.length} ${word} found`;

  // --i gives each card a delay so they fade in one after another
  resultsDiv.innerHTML = matches
    .slice(0, 50)
    .map(({ drink, missing }, index) => {
      const note =
        missing.length === 0
          ? "You have everything!"
          : `Missing: ${missing.join(", ")}`;
      return `
        <div class="drink-card" style="--i:${Math.min(index, 12)}" data-id="${drink.idDrink}">
          <img src="${drink.strDrinkThumb}/medium" alt="${drink.strDrink}">
          <div class="card-body">
            <h3>${drink.strDrink}</h3>
            <p>${note}</p>
          </div>
        </div>`;
    })
    .join("");
}

function update() {
  showChips();
  showPopular();
  showResults();
}

// Open the recipe popup for one drink
function showDetails(id) {
  const drink = allDrinks.find((d) => d.idDrink === id);
  if (!drink) return;

  let ingredientItems = "";
  for (let i = 1; i <= 15; i++) {
    const name = drink[`strIngredient${i}`];
    if (!name) continue;

    const measure = drink[`strMeasure${i}`] || "";
    const lowerName = name.trim().toLowerCase();
    const have =
      selected.includes(lowerName) || ALWAYS_HAVE.includes(lowerName);

    ingredientItems += `
      <li class="${have ? "have" : "missing"}">
        ${measure} ${name} ${have ? "✓" : "(missing)"}
      </li>`;
  }

  dialog.innerHTML = `
    <button id="close-dialog">Close</button>
    <img src="${drink.strDrinkThumb}/medium" alt="${drink.strDrink}" width="250">
    <h2>${drink.strDrink}</h2>
    <p>${drink.strAlcoholic} · ${drink.strCategory} · ${drink.strGlass}</p>
    <h3>Ingredients</h3>
    <ul>${ingredientItems}</ul>
    <h3>Instructions</h3>
    <p>${drink.strInstructions}</p>
  `;

  dialog.showModal();
}

// Fill the Category and Glass dropdowns from the data
function fillFilterOptions() {
  const categories = [...new Set(allDrinks.map((d) => d.strCategory))].sort();
  const glasses = [...new Set(allDrinks.map((d) => d.strGlass))].sort();

  categorySelect.innerHTML += categories
    .filter(Boolean)
    .map((c) => `<option value="${c}">${c}</option>`)
    .join("");

  glassSelect.innerHTML += glasses
    .filter(Boolean)
    .map((g) => `<option value="${g}">${g}</option>`)
    .join("");
}

// ---------- 4. USER ACTIONS ----------

function addIngredient() {
  const name = input.value.trim().toLowerCase();
  input.value = "";

  if (name === "" || selected.includes(name)) return;

  if (knownIngredients.length === 0) {
    statusText.textContent = "Still loading cocktails, try again in a moment.";
    return;
  }

  if (!knownIngredients.includes(name)) {
    statusText.textContent = `"${name}" isn't in the database. Pick one from the suggestions.`;
    return;
  }

  selected.push(name);
  update();
}

addButton.addEventListener("click", addIngredient);

clearButton.addEventListener("click", () => {
  selected = [];
  update();
});

// ----- Search suggestions dropdown -----
let activeIndex = -1;   // which suggestion is highlighted with the arrow keys

function showSuggestions(showAll = false) {
  const text = input.value.trim().toLowerCase();

  // Nothing typed and the arrow wasn't clicked: keep the list closed
  if ((text === "" && !showAll) || knownIngredients.length === 0) {
    hideSuggestions();
    return;
  }

  let matches = knownIngredients
    .filter((name) => name.includes(text) && !selected.includes(name))
    .sort(
      (a, b) =>
        Number(b.startsWith(text)) - Number(a.startsWith(text)) ||
        a.localeCompare(b)
    );

  // When typing, show the top 8. When the arrow is clicked, show everything.
  if (!showAll) matches = matches.slice(0, 8);

  suggestionsList.innerHTML =
    matches.length === 0
      ? `<li class="no-match">No matching ingredients</li>`
      : matches
          .map((name) => `<li data-name="${name}">${name}</li>`)
          .join("");

  activeIndex = -1;
  suggestionsList.hidden = false;
  searchBox.classList.add("open");
}

function hideSuggestions() {
  suggestionsList.hidden = true;
  suggestionsList.innerHTML = "";
  searchBox.classList.remove("open");
  activeIndex = -1;
}

function highlightSuggestion(items) {
  items.forEach((li, i) => li.classList.toggle("active", i === activeIndex));
  if (items[activeIndex]) items[activeIndex].scrollIntoView({ block: "nearest" });
}

input.addEventListener("input", () => showSuggestions());
input.addEventListener("focus", () => showSuggestions());
input.addEventListener("blur", hideSuggestions);

// The chevron: open the full ingredient list, or close it if it's open
toggleButton.addEventListener("mousedown", (event) => {
  event.preventDefault();               // keeps the search box focused
  const wasOpen = !suggestionsList.hidden;
  input.focus();
  if (wasOpen) {
    hideSuggestions();
  } else {
    showSuggestions(true);
  }
});

input.addEventListener("keydown", (event) => {
  const items = suggestionsList.querySelectorAll("li[data-name]");

  if (event.key === "ArrowDown" && items.length > 0) {
    event.preventDefault();
    activeIndex = (activeIndex + 1) % items.length;
    highlightSuggestion(items);
  } else if (event.key === "ArrowUp" && items.length > 0) {
    event.preventDefault();
    activeIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
    highlightSuggestion(items);
  } else if (event.key === "Enter") {
    event.preventDefault();
    if (activeIndex >= 0 && items[activeIndex]) {
      input.value = items[activeIndex].dataset.name;
    }
    addIngredient();
    hideSuggestions();
  } else if (event.key === "Escape") {
    hideSuggestions();
  }
});

// Clicking a suggestion adds it (mousedown fires before the input loses focus)
suggestionsList.addEventListener("mousedown", (event) => {
  const item = event.target.closest("li[data-name]");
  if (!item) return;
  event.preventDefault();
  input.value = item.dataset.name;
  addIngredient();
  hideSuggestions();
});

// Removing a chip with its × button
chipsDiv.addEventListener("click", (event) => {
  if (event.target.classList.contains("remove-chip")) {
    const name = event.target.dataset.name;
    selected = selected.filter((item) => item !== name);
    update();
  }
});

// Clicking a popular ingredient adds it, or removes it if already selected
popularGrid.addEventListener("click", (event) => {
  const button = event.target.closest(".popular-item");
  if (!button) return;

  const name = button.dataset.name;
  if (selected.includes(name)) {
    selected = selected.filter((item) => item !== name);
  } else {
    selected.push(name);
  }
  update();
});

// Clicking a drink card opens its recipe
resultsDiv.addEventListener("click", (event) => {
  const card = event.target.closest(".drink-card");
  if (card) showDetails(card.dataset.id);
});

// Close the popup with the button, or by clicking outside it
dialog.addEventListener("click", (event) => {
  if (event.target.id === "close-dialog" || event.target === dialog) {
    dialog.close();
  }
});

// Filters
document.querySelectorAll('input[name="drink-type"]').forEach((radio) => {
  radio.addEventListener("change", () => {
    filters.type = radio.value;
    showResults();
  });
});

categorySelect.addEventListener("change", () => {
  filters.category = categorySelect.value;
  showResults();
});

glassSelect.addEventListener("change", () => {
  filters.glass = glassSelect.value;
  showResults();
});

exactToggle.addEventListener("change", () => {
  filters.exact = exactToggle.checked;
  showResults();
});

// ---------- 5. START THE APP ----------

// If the data can't be loaded, say so instead of showing an empty page
function showLoadError() {
  loader.classList.add("error");
  loaderText.textContent =
    "Couldn't load the cocktails. Check your connection and try again.";
}

retryButton.addEventListener("click", () => location.reload());

async function start() {
  // Load the data, but keep the loading screen up for at least 0.9 seconds
  // so the animation is actually seen
  const [drinks] = await Promise.all([
    loadAllDrinks(),
    new Promise((resolve) => setTimeout(resolve, 900)),
  ]);

  allDrinks = drinks;

  if (allDrinks.length === 0) {
    showLoadError();
    return;
  }

  allDrinks.forEach((drink) => {
    drink.ingredients = getIngredients(drink);
  });

  // Build the list of all valid ingredient names
  knownIngredients = [...new Set(allDrinks.flatMap((d) => d.ingredients))].sort();

  fillFilterOptions();
  showPopular();
  showResults(); // shows the friendly "pick your ingredients" message

  // Fade out the loading screen and bring the panels in
  loader.classList.add("hidden");
  document.body.classList.add("loaded");
}

start();