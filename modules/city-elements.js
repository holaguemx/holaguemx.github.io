const SHEET_CITY_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSnCE6UL7mfg1wEGDaUj5x5FFnebN5QG8zihbtEWvx7XBtdrnfsqbxY3a4X5-x2SeAiadca9B9jp9dp/pub?gid=0&single=true&output=csv";

const SHEET_POLYGON_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSnCE6UL7mfg1wEGDaUj5x5FFnebN5QG8zihbtEWvx7XBtdrnfsqbxY3a4X5-x2SeAiadca9B9jp9dp/pub?gid=1002889666&single=true&output=csv";

document.addEventListener('DOMContentLoaded', () => {
  const btn   = document.getElementById('city-options');
  const panel = document.getElementById('city-options-panel');
  panel.style.display = 'none';

  btn.addEventListener('click', e => {
    e.stopPropagation();
    panel.style.display = panel.style.display === 'flex' ? 'none' : 'flex';
  });

  document.addEventListener('click', e => {
    if (!panel.contains(e.target) && !btn.contains(e.target)) {
      panel.style.display = 'none';
    }
  });

  // ———————————— Checkbox ↔ Categoría ————————————
  const idToCategory = {
    'opt-airports':       'Airports',
    'opt-audience':       'Audience & Concerts Venues',
    'opt-evcs':           'Electric Vehicles Charging Stations',
    'opt-public-parks':   'Public Parks',
    'opt-schools':        'Universities & Highschools',
    'opt-stadiums':       'Sport Stadiums',
    'opt-urbantrain':     'Urban Train Stations'
  };

  const markersByCategory  = {};
  const polygonsByCategory = {};

  Object.keys(idToCategory).forEach(id => {
    const cb = document.getElementById(id);
    cb.checked = false;
    cb.addEventListener('change', () => {
      const cat = idToCategory[id];
      const visible = cb.checked;

      // Mostrar/Ocultar markers
      (markersByCategory[cat] || []).forEach(m => m.setVisible(visible));

      // Mostrar/Ocultar polígonos
      (polygonsByCategory[cat] || []).forEach(p => p.setMap(visible ? map : null));
    });
  });

  // ———————————— Cargar MARKERS ————————————
  Papa.parse(SHEET_CITY_URL, {
    download: true,
    header:   true,
    complete: results => {
      console.log('Markers found in City Elements:', results.data.length);
      results.data.forEach(row => {
        const lat = parseFloat(row.lat);
        const lng = parseFloat(row.lng);
        if (isNaN(lat) || isNaN(lng)) return;

        const cat = row.category;
        if (!Object.values(idToCategory).includes(cat)) return;

        const marker = new google.maps.Marker({
          position: { lat, lng },
          map,
          title: row.name,
          icon: {
            url: row.icon,
            scaledSize: new google.maps.Size(32, 34)
          }
        });
        marker.setVisible(false);

        markersByCategory[cat] = markersByCategory[cat] || [];
        markersByCategory[cat].push(marker);
      });
    },
    error: err => console.error('Error cargando CSV de markers:', err)
  });

  // ———————————— Cargar POLÍGONOS ————————————
  Papa.parse(SHEET_POLYGON_URL, {
    download: true,
    header:   true,
    complete: results => {
      console.log('Polygons found in City Elements:', results.data.length);
      results.data.forEach(row => {
        const cat = row.category;
        const wkt = row.wkt;

        if (!Object.values(idToCategory).includes(cat)) return;
        if (!wkt || !wkt.startsWith("POLYGON")) return;

        const polygonPaths = parseWKTPolygon(wkt);
        if (!polygonPaths) return;

const color = row.color || "#FF6600";
const name  = row.name || "Polígono sin nombre";

const polygon = new google.maps.Polygon({
  paths: polygonPaths,
  strokeColor: color,
  strokeOpacity: 0.8,
  strokeWeight: 2,
  fillColor: color,
  fillOpacity: 0.35,
  map: null
});

// Calcular área y guardar en customData
const area = google.maps.geometry.spherical.computeArea(polygon.getPath());
polygon.customData = { name, area };

// Aplicar tooltip
applyPolygonTooltip(polygon, name);

// Guardar referencia
polygonsByCategory[cat] = polygonsByCategory[cat] || [];
polygonsByCategory[cat].push(polygon);
      });
    },
    error: err => console.error('Error cargando CSV de polígonos:', err)
  });

  // ———————————— Función para convertir WKT a paths ————————————
  function parseWKTPolygon(wkt) {
    try {
      const coords = wkt
        .replace("POLYGON((", "")
        .replace("))", "")
        .split(",")
        .map(pair => {
          const [lng, lat] = pair.trim().split(" ").map(Number);
          return { lat, lng };
        });
      return [coords]; // Google Maps espera un array de paths
    } catch (e) {
      console.warn("❌ WKT inválido:", wkt);
      return null;
    }
  }
});