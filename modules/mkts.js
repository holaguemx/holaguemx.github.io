
async function exportAnalysis(data) {
  const password = "MarketSpots2025";

  // 1) Leer y serializar custom pins y polígonos definidos por el usuario
  const customPins = JSON.parse(localStorage.getItem("customPins") || "[]");
  const customPolygons = JSON.parse(localStorage.getItem("customPolygons") || "[]");

// 2) Serializar los datos importados (MKTS)
//   Reutilizamos directamente lo que ya guardaste al cargar el KMZ
const storedKMZ = JSON.parse(
  localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}'
);

// a) Pines importados
const serializedPins = (storedKMZ.pins || []).map(pin => ({
  name:     pin.name     || "",
  position: pin.position || {lat:0,lng:0},
  iconUrl:  pin.iconUrl  || null
}));

// b) Polígonos importados
const serializedPolygons = (storedKMZ.polygons || []).map(poly => ({
  name:         poly.name         || "",
  paths:        poly.paths        || [], 
  strokeColor:  poly.strokeColor  || "#000000",
  strokeOpacity:poly.strokeOpacity|| 1.0,
  strokeWeight: poly.strokeWeight || 2,
  fillColor:    poly.fillColor    || "#000000",
  fillOpacity:  poly.fillOpacity  || 0.5,
  // si guardaste area en el KMZ import original, úsalo; si no, lo recalculas
  area:         poly.area != null
                  ? poly.area
                  : parseFloat(
                      google.maps.geometry.spherical
                        .computeArea(poly.paths.map(p=>new google.maps.LatLng(p.lat,p.lng)))
                        .toFixed(2)
                    )
}));

const serializedKMZ = {
  pins:     serializedPins,
  polygons: serializedPolygons
};

  // 3) Inyectar al objeto data antes de cifrar
  data.customPins     = customPins;
  data.customPolygons = customPolygons;
  data.importedKMZ    = serializedKMZ;


    // 3bis) Incluir la posición actual del mapa
  data.center = map.getCenter().toJSON();  // { lat: ..., lng: ... }
  data.zoom   = map.getZoom();

  // ---------------------------------------------------------------------------
  // Añadir selección de estados y municipios al análisis antes de cifrar
  // Esto permite que los archivos MKTS incluyan los estados y municipios
  // activados por el usuario en el panel de "City Limits" (municipios-panel).
  // Si no existen selecciones o el panel no está construido, no añadirá nada.
  try {
    const { selectedStates, selectedMunicipios } = gatherSelectedMunicipios();
    if (selectedStates && selectedStates.length > 0) {
      data.selectedStates = selectedStates;
    }
    if (selectedMunicipios && selectedMunicipios.length > 0) {
      data.selectedMunicipios = selectedMunicipios;
    }
  } catch (err) {
    console.warn('No se pudieron capturar los estados/municipios seleccionados:', err);
  }

  // 4) Configurar cifrado AES-GCM con PBKDF2
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("marketspots-salt"),
      iterations: 150000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  // 5) Cifrar el JSON de data
  const encodedData = enc.encode(JSON.stringify(data));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encodedData
  );

  // 6) Generar y descargar el archivo .mkts
  const blob = new Blob([iv, new Uint8Array(encrypted)], {
    type: "application/octet-stream"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const fileNameInput = document.getElementById("filename-input");
  const finalName = fileNameInput?.value?.trim() || `marketspot_${Date.now()}`;
  a.download = `${finalName}.mkts`;
  a.click();
  URL.revokeObjectURL(url);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

async function importAnalysis(file, onDataLoaded) {
  const reader = new FileReader();
  reader.onload = async function () {
    const buffer = reader.result;
    const iv = buffer.slice(0, 12);
    const data = buffer.slice(12);
    try {
      const password = "MarketSpots2025";
      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]
      );
      const key = await crypto.subtle.deriveKey({
        name: "PBKDF2",
        salt: enc.encode("marketspots-salt"),
        iterations: 150000,
        hash: "SHA-256"
      }, keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(iv) },
        key,
        data
      );
      const json = JSON.parse(new TextDecoder().decode(decrypted));

      // -------------------------------------------------------------------------
      // Restaurar selección de estados y municipios.
      // Guardamos en localStorage para que el panel de municipios lea las
      // selecciones cuando se vuelva a cargar. Además intentamos restaurar
      // inmediatamente los checkboxes si ya existen en el DOM.
      if (json.selectedStates) {
        try {
          localStorage.setItem('selectedStates', JSON.stringify(json.selectedStates));
        } catch (_) {}
      }
      if (json.selectedMunicipios) {
        try {
          localStorage.setItem('selectedMunicipios', JSON.stringify(json.selectedMunicipios));
        } catch (_) {}
      }
      if (typeof restoreSelectedMunicipios === 'function' && json.selectedMunicipios) {
        // Restaurar después de un pequeño retardo para asegurar que la UI esté lista
        setTimeout(() => restoreSelectedMunicipios(json.selectedMunicipios), 500);
      }

      // 1) Limpiar cualquier importación previa de MKTS
      if (window.importedKMZPolygons) {
        window.importedKMZPolygons.forEach(p => p.setMap(null));
      }
      window.importedKMZPolygons = [];

      // 2) Limpiar regla previa y ocultar su popup
      if (window.rulerPolyline) {
        window.rulerPolyline.setMap(null);
        window.rulerPolyline = null;
      }
      const popup = document.getElementById("ruler-popup");
      if (popup) popup.style.display = "none";

      // 3) Restaurar custom pins
      if (json.customPins) {
        localStorage.setItem("customPins", JSON.stringify(json.customPins));
        loadLocalPins();
      }

      // 4) Restaurar custom polygons
      if (json.customPolygons) {
        localStorage.setItem("customPolygons", JSON.stringify(json.customPolygons));
        if (typeof loadLocalPolygons === "function") {
          loadLocalPolygons();
        }
      }

      // 5) Restaurar importedKMZ (polígonos importados)
      if (json.importedKMZ) {
        localStorage.setItem("importedKMZ", JSON.stringify(json.importedKMZ));
      }

      // 6) Llamar al callback para que el mapa restaure filtros, centro, polígonos y regla
      onDataLoaded(json);
    } catch (e) {
      showToast("No se pudo leer el archivo.");
      console.error(e);
    }
  };
  reader.readAsArrayBuffer(file);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

function applyPolygonTooltip(polygon, label, extraHtmlFn) {
  const fmt = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  // Función por defecto: calcula el área al vuelo
  const htmlFn = typeof extraHtmlFn === "function"
    ? extraHtmlFn
    : p => {
        const a = google.maps.geometry.spherical.computeArea(p.getPath());
        return `${fmt.format(a)} m²`;
      };

  polygon.addListener("mouseover", () => {
    tooltipDiv.innerHTML = `<strong>${label}</strong><br>${htmlFn(polygon)}`;
    tooltipDiv.style.display = "block";
  });
  polygon.addListener("mousemove", e => {
    const pos = tooltipOverlay.getProjection().fromLatLngToDivPixel(e.latLng);
    tooltipDiv.style.left = pos.x + "px";
    tooltipDiv.style.top  = pos.y + "px";
  });
  polygon.addListener("mouseout", () => {
    tooltipDiv.style.display = "none";
  });
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

async function triggerImport() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".mkts";
  input.onchange = () => {
    const file = input.files[0];
    if (!file) return;

    importAnalysis(file, (loadedData) => {
  try {
    // — antes de cualquier creación de círculos o polígonos —
    if (loadedData.center) {
      map.setCenter(loadedData.center);
    }
    if (loadedData.zoom != null) {
      map.setZoom(loadedData.zoom);
    }

    // 1) Desempaquetar datos restaurados
    const {
      center,       // ya no lo usaremos aquí para el círculo
      radius,
      pins,
      filters,
      customPins,
      customPolygons
    } = loadedData;

        // 2) Restaurar círculo
        if (currentCircle) {
          currentCircle.setMap(null);
          currentCircle = null;
        }
        let circle = null;
        if (center && radius) {
          circle = new google.maps.Circle({
            map,
            center,
            radius,
            fillColor:   "#000000",
            fillOpacity: 0.25,
            strokeColor: "#FF0000",
            strokeWeight: 5,
            clickable:   false,
            editable:    false,
            zIndex:      100
          });
          currentCircle = circle;
        }

        // 3) Restaurar regla y popup de distancia
        if (loadedData.rulerLine) {
          const { pointA, pointB } = loadedData.rulerLine;
          if (rulerPolyline) {
            rulerPolyline.setMap(null);
          }
          const linePath = [
            new google.maps.LatLng(pointA.lat, pointA.lng),
            new google.maps.LatLng(pointB.lat, pointB.lng)
          ];
          rulerPolyline = new google.maps.Polyline({
            path:       linePath,
            geodesic:   true,
            strokeColor:"#ff6600",
            strokeOpacity: 1.0,
            strokeWeight: 4,
            map,
            zIndex:     100
          });

          const popup     = document.getElementById("ruler-popup");
          const popupText = document.getElementById("ruler-popup-text");
          const distMeters = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(pointA.lat, pointA.lng),
            new google.maps.LatLng(pointB.lat, pointB.lng)
          );
          const formatted = distMeters >= 1000
            ? (distMeters / 1000).toFixed(2) + " km"
            : Math.round(distMeters) + " m";
          popupText.textContent = formatted;
          popup.style.display   = "block";
        }

        // 4) Restaurar filtros NSE
        activeNSEs = new Set(filters.nse || []);
        document.querySelectorAll("#nse-control-content input[type=checkbox]")
          .forEach(cb => {
            const value = cb.nextSibling?.textContent?.trim();
            cb.checked = activeNSEs.has(value);
            (nsePolygons[value] || []).forEach(poly =>
              poly.setMap(cb.checked ? map : null)
            );
          });

        // 5) Restaurar clasificación Retail
        const ops = Array.isArray(filters.operations) ? filters.operations : [];
        activeOperations = new Set(ops);
        document.querySelectorAll("#operations-control-content input[type=checkbox]")
          .forEach(cb => {
            const label = cb.nextSibling?.textContent?.trim() || cb.value;
            const checked = ops.includes(label);
            cb.checked = checked;
            if (checked) cb.dispatchEvent(new Event("change"));
          });

        // 6) Restaurar Locations
        activeLocationsFilter = new Set(filters.locations || []);
        document.querySelectorAll("#location-filter-content input[type=checkbox]")
          .forEach(cb => {
            const loc = cb.value;
            cb.checked = activeLocationsFilter.has(loc);
            if (cb.checked) cb.dispatchEvent(new Event("change"));
          });

        // 7) Restaurar City Boundaries
        activeLocations = new Set(filters.cityBoundaries || []);
        isRestoringCityBoundaries = true;
        document.querySelectorAll("#location-control-content input[type=checkbox]")
          .forEach(cb => {
            const city = cb.nextSibling?.textContent?.trim();
            cb.checked = activeLocations.has(city);
            if (cb.checked) cb.dispatchEvent(new Event("change"));
          });
        isRestoringCityBoundaries = false;

        // 8) Restaurar Avenues
        activeAvenues = new Set(filters.traffic || []);
        document.querySelectorAll("#avenue-control-content input[type=checkbox]")
          .forEach(cb => {
            const label = cb.parentNode?.textContent?.trim();
            if (!label || cb.classList.contains("summary-checkbox")) return;
            cb.checked = activeAvenues.has(label);
            if (cb.checked) cb.dispatchEvent(new Event("change"));
          });

        // 9) Restaurar visibilidad de markers según filtro de franquicias
        markers.forEach(marker => {
          marker.__visibleByFranchise = filters.franchises.includes(marker.franchise);
        });
        applyAllFilters();

        // 10) Panel y popup de filtros
        buildFilterPanelGlobal();
        document.getElementById("filter-panel")
          .classList.toggle("open", filters.filterPanelOpen);
        document.getElementById("popup")
          .classList.toggle("shifted", filters.filterPanelOpen);

        if (circle) {
          showPopup2FromCircle(circle);
        } else {
          window.pendingAnalysisData = loadedData;
        }

        // 11) Restaurar Custom Pins
        localStorage.setItem("customPins", JSON.stringify(customPins));
        loadLocalPins();

        // 12) Restaurar Custom Polygons (con área)
        if (customPolygons) {
          localStorage.setItem("customPolygons", JSON.stringify(customPolygons));
          drawnPolygons.forEach(p => p.setMap(null));
          drawnPolygons = [];
          loadPolygonsFromLocalStorage();
        }

        // 13) Restaurar imported KMZ (ahora incluyendo area)
        if (loadedData.importedKMZ) {
          // a) Guardar raw import para recargas
          localStorage.setItem(
            "importedKMZ",
            JSON.stringify(loadedData.importedKMZ)
          );

          // b) Limpiar viejos
          window.importedKMZPolygons?.forEach(p => p.setMap(null));
          window.importedKMZMarkers?.forEach(m => m.setMap(null));
          window.importedKMZPolygons = [];
          window.importedKMZMarkers = [];

          // c) Polígonos importados con área en customData
          loadedData.importedKMZ.polygons.forEach(polyData => {
            const polygon = new google.maps.Polygon({
              paths:         polyData.paths,
              strokeColor:   polyData.strokeColor || "#000000",
              strokeOpacity: polyData.strokeOpacity || 1.0,
              strokeWeight:  polyData.strokeWeight || 2,
              fillColor:     polyData.fillColor || "#000000",
              fillOpacity:   polyData.fillOpacity || 0.5,
              map,
              clickable:     true,
              zIndex:        98
            });

            // Propagar el área desde el archivo
            polygon.customData = {
              name: polyData.name || "",
              area: polyData.area != null ? polyData.area : google.maps.geometry.spherical.computeArea(polygon.getPath()).toFixed(2)
            };

            applyPolygonTooltip(
              polygon,
              polygon.customData.name,
              p => {
                // si customData.area existe, úsalo; si no, recalcula
                const a = polygon.customData.area;
                return `${Number(a).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })} m²`;
              }
            );

            polygon.addListener("click", () => {
              if (!confirm(`Delete Polygon "${polygon.customData.name}"?`)) return;
              polygon.setMap(null);
              window.importedKMZPolygons = window.importedKMZPolygons.filter(x => x !== polygon);
              // Actualizar storage con area incluido
              const stored = (() => {
                try {
                  return JSON.parse(localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}');
                } catch (_) {
                  return { pins: [], polygons: [] };
                }
              })();
              stored.polygons = window.importedKMZPolygons.map(p => ({
                name: p.customData.name,
                paths: p.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() })),
                strokeColor: p.strokeColor,
                strokeOpacity: p.strokeOpacity,
                strokeWeight: p.strokeWeight,
                fillColor: p.fillColor,
                fillOpacity: p.fillOpacity,
                area: p.customData.area
              }));
              localStorage.setItem("importedKMZ", JSON.stringify(stored));
            });

            window.importedKMZPolygons.push(polygon);
          });

          // d) Pines importados
          loadedData.importedKMZ.pins.forEach(pinData => {
            const marker = new google.maps.Marker({
              position: pinData.position,
              title:    pinData.name || "",
              map,
              icon:     pinData.iconUrl
                ? {
                    url:       pinData.iconUrl,
                    scaledSize:new google.maps.Size(30, 30)
                  }
                : undefined
            });
            marker.addListener("click", () => {
              if (!confirm(`Delete Marker "${pinData.name}"?`)) return;
              marker.setMap(null);
              window.importedKMZMarkers = window.importedKMZMarkers.filter(m => m !== marker);
              // Actualizar storage de pins
              const stored = (() => {
                try {
                  return JSON.parse(localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}');
                } catch (_) {
                  return { pins: [], polygons: [] };
                }
              })();
              stored.pins = window.importedKMZMarkers.map(mk => ({
                name:    mk.getTitle(),
                position:{ lat: mk.getPosition().lat(), lng: mk.getPosition().lng() },
                iconUrl: mk.getIcon() && (typeof mk.getIcon() === 'string' ? mk.getIcon() : mk.getIcon().url)
              }));
              localStorage.setItem("importedKMZ", JSON.stringify(stored));
            });
            window.importedKMZMarkers.push(marker);
          });
        }

        // 14) Feedback final
        showToast("Analysis imported and restored successfully.");
        document.getElementById("import-files-panel").style.display = "none";
      } catch (e) {
        console.error("Error rebuilding analysis:", e);
      }
    });
  };
  input.click();
}


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 

function exportCurrentAnalysis() {
  // 0) Leer y serializar customPins y customPolygons del almacenamiento local
  const customPins = JSON.parse(
    localStorage.getItem("customPins") || "[]"
  );
  const customPolygons = JSON.parse(
    localStorage.getItem("customPolygons") || "[]"
  );

  // 1) Serializamos los polígonos importados para que siempre tengan el formato { paths: [ {lat,lng}, … ] }
  const storedKMZ = JSON.parse(
    localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}'
  );
  const serializedPolygons = (window.importedKMZPolygons || []).map(polygon => ({
    name:         polygon.customData?.name        || "",
    paths:        polygon.getPath().getArray().map(ll => ({ lat: ll.lat(), lng: ll.lng() })),
    strokeColor:  polygon.strokeColor             || "#000000",
    strokeOpacity:polygon.strokeOpacity           || 1.0,
    strokeWeight: polygon.strokeWeight            || 2,
    fillColor:    polygon.fillColor               || "#000000",
    fillOpacity:  polygon.fillOpacity             || 0.5
  }));
  const serializedKMZ = {
    pins:     storedKMZ.pins,
    polygons: serializedPolygons
  };

  // 2) Construimos el resto de datos del análisis
  const pins = markers
    .filter(m => m.getVisible() && m.__visibleByFranchise)
    .map(m => ({
      franchise:  m.franchise,
      address:    m.Address,
      category:   m.category,
      subcategory:m.subcategory,
      operations: m.Operations,
      location:   m.location
    }));

  const rulerLine = rulerPolyline && rulerPolyline.getPath().getLength() === 2
    ? {
        pointA: {
          lat: rulerPolyline.getPath().getAt(0).lat(),
          lng: rulerPolyline.getPath().getAt(0).lng()
        },
        pointB: {
          lat: rulerPolyline.getPath().getAt(1).lat(),
          lng: rulerPolyline.getPath().getAt(1).lng()
        }
      }
    : null;

  // 3) Estado del panel de filtros abierto (opcional)
  const filterPanelOpen = document.getElementById("filter-panel")
    ?.classList.contains("open") || false;

  // 4) Construir el objeto data a exportar
  const data = {
    date:           new Date().toISOString(),
    center:         map.getCenter().toJSON(),
    zoom:           map.getZoom(),
    circle:         currentCircle
                      ? {
                          center: currentCircle.getCenter().toJSON(),
                          radius: currentCircle.getRadius()
                        }
                      : null,
    popupData:      popup2Data || null,
    rulerLine:      rulerLine,
    visibleMarkers: pins,
    importedKMZ:    serializedKMZ,     // polígonos y pines importados
    customPins:     customPins,        // pines creados manualmente
    customPolygons: customPolygons,    // polígonos creados manualmente
    activeFilters:  {
      locations:   Array.from(activeLocations),
      categories:  Array.from(activeCategories),
      subcategories:Array.from(activeSubcategories),
      operations:  Array.from(activeOperations),
      franchises:  Array.from(activeFranchises),
      statuses:    Array.from(activeStatuses),
      levels:      Array.from(activeLevels)
    },
    filterPanelOpen: filterPanelOpen  // para restaurar estado del panel
  };

  // -------------------------------------------------------------------------
  // Incluir la selección de estados y municipios en la exportación JSON
  try {
    const { selectedStates, selectedMunicipios } = gatherSelectedMunicipios();
    if (selectedStates && selectedStates.length > 0) {
      data.selectedStates = selectedStates;
    }
    if (selectedMunicipios && selectedMunicipios.length > 0) {
      data.selectedMunicipios = selectedMunicipios;
    }
  } catch (err) {
    console.warn('No se pudieron capturar los estados/municipios seleccionados (exportCurrentAnalysis):', err);
  }

  // 5) Generar y descargar el JSON
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (
    document.getElementById("filename-input")?.value || "analysis"
  ) + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////// 
// Funciones auxiliares para la selección de estados y municipios

/**
 * Recorre el listado de estados/municipios en el panel de City Limits y
 * devuelve los estados y municipios actualmente seleccionados por el usuario.
 * Si el panel no está presente, devuelve listas vacías.
 * @returns {{selectedStates: string[], selectedMunicipios: Array<{state: string, muni: string}>}}
 */
function gatherSelectedMunicipios() {
  const result = { selectedStates: [], selectedMunicipios: [] };
  const lista = document.getElementById('municipios-list');
  if (!lista) return result;
  // Cada estado está representado por un div con class state-group
  lista.querySelectorAll('.state-group').forEach(group => {
    const header = group.querySelector('.state-header');
    if (!header) return;
    // El label del estado es el último span dentro del header
    const stateLabelSpan = header.querySelector('span:last-child');
    const stateName = stateLabelSpan ? stateLabelSpan.textContent.trim() : '';
    const stateCb = header.querySelector('input[type="checkbox"]');
    if (stateCb && stateCb.checked && stateName) {
      result.selectedStates.push(stateName);
    }
    // Ahora recorre los hijos (checkbox de municipios)
    const muniCbs = group.querySelectorAll('div > label input[type="checkbox"]');
    muniCbs.forEach(cb => {
      if (cb.checked) {
        const state = cb.dataset.state;
        const muni  = cb.dataset.muni;
        if (state && muni) {
          result.selectedMunicipios.push({ state, muni });
        }
      }
    });
  });
  return result;
}

/**
 * Restaura la selección de municipios utilizando la lista proporcionada. Este
 * método intenta marcar los checkboxes de municipios que coinciden con los
 * nombres proporcionados y dispara el evento "change" para que los
 * polígonos asociados se muestren en el mapa. Si algún checkbox no existe
 * aún (por ejemplo, si el panel aún no se ha construido), la función no
 * tendrá efecto sobre ese municipio. Puede llamarse varias veces sin efectos
 * adversos.
 * @param {Array<{state:string, muni:string}>} selectedMunicipios 
 */
function restoreSelectedMunicipios(selectedMunicipios) {
  if (!Array.isArray(selectedMunicipios) || selectedMunicipios.length === 0) return;
  selectedMunicipios.forEach(sel => {
    try {
      const selector = `#municipios-list input[data-state="${sel.state}"][data-muni="${sel.muni}"]`;
      const cb = document.querySelector(selector);
      if (cb && !cb.checked) {
        cb.checked = true;
        // Dispara el evento change para activar el polígono
        cb.dispatchEvent(new Event('change'));
      }
    } catch (_) {
      // ignora si no puede marcar
    }
  });
}




