// ///////////////////////////////////////////////////////// Inicia Exportación a KMZ ///////////////////////////////////////////////////////////////////////////

// 🎯 Asociar al botón
document.getElementById("exportKmzBtn").addEventListener("click", exportToKMZ);

/**
 * Convierte un array de coords [{lat,lng},…] en un <Placemark> KML de tipo POLYGON,
 * usando el nombre que se le pase.
 */
function polygonToKml(name, pathArray) {
  if (!Array.isArray(pathArray) || pathArray.length < 3) return "";
  // Lon,Lat,0
  const coords = pathArray.map(p => `${p.lng},${p.lat},0`);
  // Cerramos el anillo
  if (coords[0] !== coords[coords.length - 1]) {
    coords.push(coords[0]);
  }
  return `
    <Placemark>
      <name>${name}</name>
      <Style>
        <!-- stroke FF6600 (opaco) -->
        <LineStyle>
          <color>ff0066ff</color>
          <width>2</width>
        </LineStyle>
        <!-- fill 000000 al 25% → alpha=40 hex -->
        <PolyStyle>
          <color>40000000</color>
        </PolyStyle>
      </Style>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${coords.join(" ")}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>`;
}

/**
 * Lee todos los pines y polígonos de localStorage y genera un KMZ válido para Google Earth.
 */
function exportToKMZ() {
  // 1) Recoger de localStorage
  const customPins     = JSON.parse(localStorage.getItem("customPins"))     || [];
  const researchPins   = JSON.parse(localStorage.getItem("researchPins"))   || [];
  const importedKMZ    = JSON.parse(localStorage.getItem("importedKMZ"))    || { pins: [], polygons: [] };
  const customPolygons = JSON.parse(localStorage.getItem("customPolygons")) || [];
  const excelPins      = JSON.parse(localStorage.getItem("excelData"))      || [];

  // 2) Verificar que haya algo que exportar
  const hasPins  = customPins.length > 0
                || researchPins.length > 0
                || importedKMZ.pins.length > 0
                || excelPins.length > 0;
  const hasPolys = customPolygons.length > 0
                || importedKMZ.polygons.length > 0;
  if (!hasPins && !hasPolys) {
    alert("No Data to Download");
    return;
  }

  // 3) Nombre del archivo
  const fileName = prompt("Introduzca el nombre del KMZ:", "market_spot");
  if (!fileName) {
    alert("Exportación cancelada.");
    return;
  }

  // 4) Construir KML de todos los pines (incluye excelPins)
  const allPins = [
    ...customPins,
    ...researchPins,
    ...importedKMZ.pins,
    ...excelPins
  ];

  const pinKml = allPins.map(p => {
    const name    = p.name || "Pin";
    const lat     = parseFloat(p.position?.lat);
    const lng     = parseFloat(p.position?.lng);
    const iconUrl = p.icon?.url || p.iconUrl;

    const scale = 1; // ajustar si deseas

    if (isNaN(lat) || isNaN(lng)) return "";

    const styleKml = iconUrl ? `
      <Style>
        <IconStyle>
          <scale>${scale}</scale>
          <Icon>
            <href>${iconUrl}</href>
          </Icon>
        </IconStyle>
      </Style>
    ` : "";

    return `
      <Placemark>
        <name>${name}</name>
        ${styleKml}
        <Point>
          <coordinates>${lng},${lat},0</coordinates>
        </Point>
      </Placemark>
    `;
  }).join("\n");

  // 5) Construir KML de todos los polígonos
  const allPolysRaw = [
    ...customPolygons.map(p => ({ name: p.name || "Polygon", paths: p.paths })),
    ...importedKMZ.polygons
  ];
  const polygonKml = allPolysRaw.map(p => polygonToKml(p.name, p.paths)).join("\n");

  // 6) Montar KML completo
  const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
  <kml xmlns="http://www.opengis.net/kml/2.2">
    <Document>
      <name>${fileName}</name>
      ${pinKml}
      ${polygonKml}
    </Document>
  </kml>`;

  console.log("🛰️ KML generado:\n", kmlContent);

  // 7) Empaquetar en KMZ con JSZip
  const zip = new JSZip();
  zip.file("doc.kml", kmlContent);
  zip.generateAsync({ type: "blob" }).then(blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `${fileName}.kmz`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

// ///////////////////////////////////////////////////////// Load KMZ Files (sin InfoWindow) ///////////////////////////////////////////////////////////////////////////

// Botón para seleccionar archivo KMZ
document.getElementById("kmz-trigger").addEventListener("click", () => {
  document.getElementById("kmz-input").click();
});

document.getElementById("kmz-input").addEventListener("change", function (event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById("import-files-panel").style.display = "none";
  const reader = new FileReader();

  reader.onload = e => {
    JSZip.loadAsync(e.target.result).then(zip => {
      const kmlFile = Object.keys(zip.files).find(n => n.endsWith(".kml"));
      if (!kmlFile) {
        alert("No .kml en el KMZ.");
        return;
      }
      zip.files[kmlFile].async("string").then(kmlText => {
        new geoXML3.parser({
          map: map,
          markerOptions: { clickable: true },
          afterParse: (docs) => {
            // ====== MODO ACUMULAR: NO limpiar lo anterior ======
            window.importedMarkers  = window.importedMarkers  || [];
            window.importedPolygons = window.importedPolygons || [];

            // Traer lo ya almacenado para fusionar
            const stored = JSON.parse(localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}');
            const pinsNew     = [];  // Solo de esta importación
            const polygonsNew = [];

            // Infra de tooltip reutilizable
            const tooltipOverlay = new google.maps.OverlayView();
            tooltipOverlay.onAdd = () => {};
            tooltipOverlay.draw  = () => {};
            tooltipOverlay.setMap(map);
            const tooltipDiv = document.getElementById("tooltip");

            // Procesar documentos
            docs.forEach(doc => {
              // --- Pines ---
              (doc.markers || []).forEach(gmarker => {
                // Ajustar icono si viene
                let iconUrl = null;
                const ico = gmarker.getIcon();
                if (typeof ico === 'string') iconUrl = ico;
                else if (ico && ico.url)     iconUrl = ico.url;
                if (iconUrl) {
                  gmarker.setIcon({
                    url: iconUrl,
                    scaledSize: new google.maps.Size(30, 30)
                  });
                }

                // Mantener en mapa y acumular
                gmarker.setMap(map);
                window.importedMarkers.push(gmarker);

                // Serializable
                pinsNew.push({
                  name: gmarker.getTitle() || "Pin",
                  position: {
                    lat: gmarker.getPosition().lat(),
                    lng: gmarker.getPosition().lng()
                  },
                  iconUrl
                });

                // Click → borrar y reescribir storage con lo que quede
                google.maps.event.clearListeners(gmarker, 'click');
                gmarker.addListener("click", () => {
                  const title = gmarker.getTitle();
                  if (!confirm(`Delete Marker "${title}"?`)) return;

                  gmarker.setMap(null);
                  window.importedMarkers = window.importedMarkers.filter(m => m !== gmarker);

                  const pinsAll = window.importedMarkers.map(m => ({
                    name: m.getTitle() || "Pin",
                    position: { lat: m.getPosition().lat(), lng: m.getPosition().lng() },
                    iconUrl: (() => {
                      const ic = m.getIcon();
                      return typeof ic === 'string' ? ic : (ic && ic.url) || null;
                    })()
                  }));
                  const polysAll = (window.importedPolygons || []).map(pg => ({
                    name:        pg.__name || "Polygon",
                    paths:       pg.getPath().getArray().map(c => ({ lat: c.lat(), lng: c.lng() })),
                    strokeColor: pg.get("strokeColor"),
                    strokeOpacity: pg.get("strokeOpacity"),
                    strokeWeight:  pg.get("strokeWeight"),
                    fillColor:     pg.get("fillColor"),
                    fillOpacity:   pg.get("fillOpacity"),
                    clickable:     pg.get("clickable"),
                    zIndex:        pg.get("zIndex")
                  }));
                  localStorage.setItem("importedKMZ", JSON.stringify({ pins: pinsAll, polygons: polysAll }));
                });
              });

              // --- Polígonos ---
              (doc.placemarks || []).forEach(pm => {
                if (!pm.polygon) return;

                const poly = pm.polygon;
                const name = pm.name || "Polygon";
                poly.__name = name; // útil en borrado/export

                const path = poly.getPath().getArray().map(p => ({ lat: p.lat(), lng: p.lng() }));
                polygonsNew.push({
                  name,
                  paths:         path,
                  strokeColor:   poly.strokeColor   || poly.get("strokeColor"),
                  strokeOpacity: poly.strokeOpacity || poly.get("strokeOpacity"),
                  strokeWeight:  poly.strokeWeight  || poly.get("strokeWeight"),
                  fillColor:     poly.fillColor     || poly.get("fillColor"),
                  fillOpacity:   poly.fillOpacity   || poly.get("fillOpacity"),
                  clickable:     poly.get("clickable"),
                  zIndex:        poly.get("zIndex") ?? 98
                });

                // Mostrar y acumular
                poly.setMap(map);
                window.importedPolygons.push(poly);

                // Tooltips
                google.maps.event.clearListeners(poly, 'mouseover');
                google.maps.event.clearListeners(poly, 'mousemove');
                google.maps.event.clearListeners(poly, 'mouseout');

                poly.addListener("mouseover", () => {
                  const area = google.maps.geometry.spherical.computeArea(poly.getPath());
                  const formattedArea = area.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                  tooltipDiv.innerHTML = `<strong>${name}</strong><br>${formattedArea} m²`;
                  tooltipDiv.style.display = "block";
                });
                poly.addListener("mousemove", e => {
                  const proj = tooltipOverlay.getProjection();
                  const pos  = proj.fromLatLngToDivPixel(e.latLng);
                  tooltipDiv.style.left = pos.x + "px";
                  tooltipDiv.style.top  = pos.y + "px";
                });
                poly.addListener("mouseout", () => { tooltipDiv.style.display = "none"; });

                // Click → borrar y reescribir storage con lo que quede
                google.maps.event.clearListeners(poly, 'click');
                poly.addListener("click", () => {
                  if (!confirm(`Delete Polygon "${name}"?`)) return;

                  poly.setMap(null);
                  window.importedPolygons = window.importedPolygons.filter(p => p !== poly);

                  const pinsAll = (window.importedMarkers || []).map(m => ({
                    name: m.getTitle() || "Pin",
                    position: { lat: m.getPosition().lat(), lng: m.getPosition().lng() },
                    iconUrl: (() => {
                      const ic = m.getIcon();
                      return typeof ic === 'string' ? ic : (ic && ic.url) || null;
                    })()
                  }));
                  const polysAll = (window.importedPolygons || []).map(pg => ({
                    name:        pg.__name || "Polygon",
                    paths:       pg.getPath().getArray().map(c => ({ lat: c.lat(), lng: c.lng() })),
                    strokeColor: pg.get("strokeColor"),
                    strokeOpacity: pg.get("strokeOpacity"),
                    strokeWeight:  pg.get("strokeWeight"),
                    fillColor:     pg.get("fillColor"),
                    fillOpacity:   pg.get("fillOpacity"),
                    clickable:     pg.get("clickable"),
                    zIndex:        pg.get("zIndex")
                  }));
                  localStorage.setItem("importedKMZ", JSON.stringify({ pins: pinsAll, polygons: polysAll }));
                });
              });
            });

            // ====== Fusionar con lo ya almacenado y persistir ======
            const merged = {
              pins:     [...stored.pins,     ...pinsNew],
              polygons: [...stored.polygons, ...polygonsNew]
            };
            localStorage.setItem("importedKMZ", JSON.stringify(merged));

            // Sonido (opcional)
            try { playSound("sounds/polygon.mp3"); } catch {}

            // Encadrar todo lo acumulado
// === Encadrar SOLO lo recién importado ===
const boundsNew = new google.maps.LatLngBounds();
let anyNew = false;

// Pins de ESTA importación
(pinsNew || []).forEach(p => {
  boundsNew.extend(new google.maps.LatLng(p.position.lat, p.position.lng));
  anyNew = true;
});

// Polígonos de ESTA importación
(polygonsNew || []).forEach(pg => {
  (pg.paths || []).forEach(c => {
    boundsNew.extend(new google.maps.LatLng(c.lat, c.lng));
    anyNew = true;
  });
});

if (anyNew) {
  map.fitBounds(boundsNew);
  google.maps.event.addListenerOnce(map, 'idle', () => {
    if (map.getZoom() > 18) map.setZoom(18); // opcional
  });
}
          }
        }).parseKmlString(kmlText);
      });
    });
  };

  reader.readAsArrayBuffer(file);
});


function renderImportedKMZ() {
  const imported = JSON.parse(
    localStorage.getItem("importedKMZ") ||
    '{"pins":[],"polygons":[]}'
  );

  // Limpiar previos
  (window.importedMarkers  || []).forEach(m => m.setMap(null));
  (window.importedPolygons || []).forEach(p => p.setMap(null));
  window.importedMarkers  = [];
  window.importedPolygons = [];

  // Pines
  imported.pins.forEach(pin => {
    const opts = {
      position: pin.position,
      title:    pin.name,
      map
    };
if (pin.iconUrl) {
  const w = Number(pin.iconW) || 30;  // fallback 30
  const h = Number(pin.iconH) || 30;  // fallback 30
  opts.icon = { url: pin.iconUrl, scaledSize: new google.maps.Size(w, h) };
}    const m = new google.maps.Marker(opts);
    window.importedMarkers.push(m);
  });

  // Polígonos
  imported.polygons.forEach(poly => {
    const p = new google.maps.Polygon({
      paths:         poly.paths,
      strokeColor:   poly.strokeColor,
      strokeOpacity: poly.strokeOpacity,
      strokeWeight:  poly.strokeWeight,
      fillColor:     poly.fillColor,
      fillOpacity:   poly.fillOpacity,
      clickable:     poly.clickable,
      zIndex:        poly.zIndex,
      map
    });
    p.__name = poly.name || "Polygon";
    window.importedPolygons.push(p);
  });
}



// Utilidad opcional si la usas en otros lados
function applyPolygonTooltip(polygon, label, extraHtmlFn) {
  const tooltipDiv = document.getElementById("tooltip");
  const tooltipOverlay = new google.maps.OverlayView();
  tooltipOverlay.onAdd = () => {};
  tooltipOverlay.draw  = () => {};
  tooltipOverlay.setMap(map);

  polygon.addListener("mouseover", e => {
    const html = extraHtmlFn
      ? `${label}<br>${extraHtmlFn(polygon)}`
      : label;
    tooltipDiv.innerHTML    = html;
    const pos = tooltipOverlay
      .getProjection()
      .fromLatLngToDivPixel(e.latLng);
    tooltipDiv.style.left   = pos.x + "px";
    tooltipDiv.style.top    = pos.y + "px";
    tooltipDiv.style.display= "block";
  });
  polygon.addListener("mousemove", e => {
    const pos = tooltipOverlay
      .getProjection()
      .fromLatLngToDivPixel(e.latLng);
    tooltipDiv.style.left = pos.x + "px";
    tooltipDiv.style.top  = pos.y + "px";
  });
  polygon.addListener("mouseout", () => {
    tooltipDiv.style.display = "none";
  });
}
