const MAPSERVER_URL =
  "https://bpr-sig.culture.gouv.fr/server/rest/services/Monuments_Historiques_ext/MapServer";

const statusBanner = document.getElementById("status-banner");
const layerSelect = document.getElementById("layer-select");
const dynamicFilters = document.getElementById("dynamic-filters");
const searchInput = document.getElementById("search-input");
const resetButton = document.getElementById("reset-btn");

const map = L.map("map", {
  center: [46.7, 2.5],
  zoom: 6,
});

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let serviceMetadata;
let currentLayer;
let geoJsonLayer;
let filterState = {
  search: "",
  fields: {},
};

// Étape 1 : Interroger le MapServer pour identifier les couches de type FeatureLayer.
async function loadServiceMetadata() {
  const response = await fetch(`${MAPSERVER_URL}?f=pjson`);
  if (!response.ok) {
    throw new Error("Impossible de charger les métadonnées du service ArcGIS.");
  }

  const metadata = await response.json();
  const layers = (metadata.layers || []).filter((layer) => layer.type === "Feature Layer");

  if (!layers.length) {
    throw new Error("Aucune Feature Layer exploitable n'a été trouvée.");
  }

  serviceMetadata = { ...metadata, layers };
}

// Étape 2 : Alimenter le sélecteur de couches pour permettre le changement de contexte de filtre.
function populateLayerSelect() {
  layerSelect.innerHTML = "";

  serviceMetadata.layers.forEach((layer) => {
    const option = document.createElement("option");
    option.value = String(layer.id);
    option.textContent = `${layer.name} (id: ${layer.id})`;
    layerSelect.appendChild(option);
  });
}

// Étape 3 : Charger les champs de la couche sélectionnée pour construire les filtres dynamiques.
async function loadLayerMetadata(layerId) {
  const response = await fetch(`${MAPSERVER_URL}/${layerId}?f=pjson`);
  if (!response.ok) {
    throw new Error("Impossible de charger la description de la couche.");
  }

  currentLayer = await response.json();
}

// Étape 4 : Créer un panneau de filtres basé sur les attributs trouvés dans la couche courante.
function renderDynamicFilters() {
  dynamicFilters.innerHTML = "";

  const filterableFields = (currentLayer.fields || []).filter((field) => {
    const typeIsAllowed = [
      "esriFieldTypeString",
      "esriFieldTypeInteger",
      "esriFieldTypeSmallInteger",
      "esriFieldTypeDouble",
      "esriFieldTypeSingle",
    ].includes(field.type);

    return typeIsAllowed && !field.name.startsWith("Shape");
  });

  const suggestedFields = filterableFields.slice(0, 4);

  if (!suggestedFields.length) {
    dynamicFilters.innerHTML =
      '<div class="alert alert-warning mb-0">Aucun champ attributaire filtrable détecté.</div>';
    return;
  }

  suggestedFields.forEach((field) => {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-2";

    const label = document.createElement("label");
    label.className = "form-label";
    label.setAttribute("for", `field-${field.name}`);
    label.textContent = field.alias || field.name;

    const input = document.createElement("input");
    input.className = "form-control";
    input.id = `field-${field.name}`;
    input.placeholder = `Filtrer par ${field.alias || field.name}`;
    input.addEventListener("input", () => {
      filterState.fields[field.name] = input.value;
      refreshLayerData();
    });

    wrapper.append(label, input);
    dynamicFilters.appendChild(wrapper);
  });

  const helper = document.createElement("small");
  helper.className = "text-muted";
  helper.textContent =
    "Les filtres sont construits automatiquement depuis les champs attributaires de la couche ESRI.";
  dynamicFilters.appendChild(helper);
}

// Étape 5 : Générer la clause WHERE ArcGIS à partir des filtres saisis dans la barre latérale.
function buildWhereClause() {
  const clauses = ["1=1"];

  if (filterState.search.trim()) {
    const textFields = (currentLayer.fields || []).filter(
      (field) => field.type === "esriFieldTypeString" && !field.name.startsWith("Shape")
    );

    if (textFields.length) {
      const search = filterState.search.replace(/'/g, "''");
      const searchClause = textFields
        .slice(0, 5)
        .map((field) => `UPPER(${field.name}) LIKE UPPER('%${search}%')`)
        .join(" OR ");
      clauses.push(`(${searchClause})`);
    }
  }

  Object.entries(filterState.fields).forEach(([fieldName, value]) => {
    if (!value?.trim()) {
      return;
    }

    const field = currentLayer.fields.find((item) => item.name === fieldName);
    if (!field) {
      return;
    }

    const sanitized = value.replace(/'/g, "''");
    if (field.type === "esriFieldTypeString") {
      clauses.push(`UPPER(${fieldName}) LIKE UPPER('%${sanitized}%')`);
      return;
    }

    if (!Number.isNaN(Number(sanitized))) {
      clauses.push(`${fieldName} = ${Number(sanitized)}`);
    }
  });

  return clauses.join(" AND ");
}

// Étape 6 : Interroger la couche ArcGIS avec la clause WHERE et afficher les entités sur Leaflet.
async function refreshLayerData() {
  const where = buildWhereClause();
  const query = new URLSearchParams({
    where,
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "geojson",
  });

  statusBanner.className = "alert alert-info m-3 py-2";
  statusBanner.textContent = "Chargement des entités filtrées…";

  const response = await fetch(`${MAPSERVER_URL}/${currentLayer.id}/query?${query}`);
  if (!response.ok) {
    throw new Error("Erreur lors de la requête des entités filtrées.");
  }

  const geojson = await response.json();

  if (geoJsonLayer) {
    map.removeLayer(geoJsonLayer);
  }

  geoJsonLayer = L.geoJSON(geojson, {
    pointToLayer: (_feature, latlng) =>
      L.circleMarker(latlng, {
        radius: 5,
        fillColor: "#0c66e4",
        color: "#1f2a44",
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      }),
    onEachFeature: (feature, layer) => {
      const attributes = feature.properties || {};
      const html = Object.entries(attributes)
        .slice(0, 8)
        .map(
          ([key, value]) =>
            `<div><span class="fw-semibold">${key}</span>: ${value ?? "-"}</div>`
        )
        .join("");

      layer.bindPopup(`<div class="small">${html}</div>`);
    },
  }).addTo(map);

  if (geoJsonLayer.getLayers().length) {
    map.fitBounds(geoJsonLayer.getBounds(), { padding: [20, 20] });
  }

  statusBanner.className = "alert alert-success m-3 py-2";
  statusBanner.textContent = `${geoJsonLayer.getLayers().length} entité(s) affichée(s).`;
}

// Étape 7 : Brancher les événements UI (sélection couche, recherche, reset) pour relancer le flux.
function setupEventHandlers() {
  layerSelect.addEventListener("change", async () => {
    filterState = { search: "", fields: {} };
    searchInput.value = "";

    await loadLayerMetadata(layerSelect.value);
    renderDynamicFilters();
    await refreshLayerData();
  });

  searchInput.addEventListener("input", () => {
    filterState.search = searchInput.value;
    refreshLayerData();
  });

  resetButton.addEventListener("click", async () => {
    filterState = { search: "", fields: {} };
    searchInput.value = "";

    renderDynamicFilters();
    await refreshLayerData();
  });
}

// Étape 8 : Initialiser l'application avec gestion d'erreur explicite et message utilisateur.
async function bootstrap() {
  try {
    await loadServiceMetadata();
    populateLayerSelect();
    await loadLayerMetadata(layerSelect.value);
    renderDynamicFilters();
    setupEventHandlers();
    await refreshLayerData();
  } catch (error) {
    statusBanner.className = "alert alert-danger m-3 py-2";
    statusBanner.textContent = `Erreur: ${error.message}`;
  }
}

bootstrap();
