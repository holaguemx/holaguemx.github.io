///////////////////////////////////////////////////////// Inicia Exportación a KMZ ///////////////////////////////////////////////////////////////////////////

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
      ...excelPins      // <— añadimos aquí
    ];
    
    const pinKml = allPins.map(p => {
      const name    = p.name || "Pin";
      const lat     = parseFloat(p.position?.lat);
      const lng     = parseFloat(p.position?.lng);
      const iconUrl = p.icon?.url || p.iconUrl;
    
      // Asumimos iconos de 30×30px, así que el scale es 30/30 = 1
      const scale = 1;                   // ajustar escala si quieres
    
      if (isNaN(lat) || isNaN(lng)) return "";
    
      // construimos el bloque <Style> solo si hay icono
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
      a.href        = url;
      a.download    = `${fileName}.kmz`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

///////////////////////////////////////////////////////// Load KMZ Files (sin InfoWindow) ///////////////////////////////////////////////////////////////////////////



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
          afterParse: docs => {
            // 1) Inicializar arrays de storage
            const stored    = JSON.parse(localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}');
            const pins      = [];  // siempre vacíos para recarga completa
            const polygons  = [];

            // 2) Limpia viejos overlays
            (window.importedMarkers  || []).forEach(m => m.setMap(null));
            (window.importedPolygons || []).forEach(p => p.setMap(null));
            window.importedMarkers  = [];
            window.importedPolygons = [];

            const tooltipOverlay = new google.maps.OverlayView();
            tooltipOverlay.onAdd = () => {};
            tooltipOverlay.draw  = () => {};
            tooltipOverlay.setMap(map);
            const tooltipDiv = document.getElementById("tooltip");

            // 3) Procesa cada doc
            docs.forEach(doc => {
              // — Pines generados por geoXML3 —
              (doc.markers || []).forEach(gmarker => {
                window.importedMarkers.push(gmarker);
                google.maps.event.clearListeners(gmarker, 'click');
    

                // Extraer URL si existe
                let iconUrl = null;
                const ico = gmarker.getIcon();
                if (typeof ico === 'string') {
                  iconUrl = ico;
                } else if (ico && ico.url) {
                  iconUrl = ico.url;
                }
                
                // Si encontraste un icono en el KML, asígnaselo al marker con scaledSize 30×30
                if (iconUrl) {
                  gmarker.setIcon({
                    url:        iconUrl,
                    // fuerza 30px ancho × 30px alto
                    scaledSize: new google.maps.Size(30, 30)
                  });
                }

                pins.push({
                  name:     gmarker.getTitle(),
                  position: {
                    lat: gmarker.getPosition().lat(),
                    lng: gmarker.getPosition().lng()
                  },
                  iconUrl  // string o null
                });

                gmarker.addListener("click", () => {
                  const title = gmarker.getTitle();
                  if (!confirm(`Delete Marker "${title}"?`)) return;
              
                  // 1) Quitar del mapa
                  gmarker.setMap(null);
              
                  // 2) Quitar de tu array en memoria
                  window.importedMarkers = window.importedMarkers.filter(m => m !== gmarker);
              
                  // 3) Reescribir storage con los pins que quedan
                  const stored = JSON.parse(localStorage.getItem("importedKMZ") || '{"pins":[],"polygons":[]}');
                  stored.pins = window.importedMarkers.map(m => ({
                    name:     m.getTitle(),
                    position: {
                      lat: m.getPosition().lat(),
                      lng: m.getPosition().lng()
                    },
                    iconUrl: m.getIcon() && (typeof m.getIcon() === 'string' ? m.getIcon() : m.getIcon().url)
                  }));
                  localStorage.setItem("importedKMZ", JSON.stringify(stored));
                });

              });

// — Polígonos —
(doc.placemarks || []).forEach(pm => {
  if (!pm.polygon) return;
  const poly = pm.polygon;
  const name = pm.name || "Polygon";
  const path = poly.getPath().getArray().map(p => ({
    lat: p.lat(), lng: p.lng()
  }));

  // ✅ Guardar con estilos originales
  polygons.push({
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

  // ✅ Mostrar sin sobrescribir estilo
  poly.setMap(map);
  window.importedPolygons.push(poly);
  google.maps.event.clearListeners(poly, 'click');


// Tooltip en polígonos
poly.addListener("mouseover", () => {
  const area = google.maps.geometry.spherical.computeArea(poly.getPath());
  const formattedArea = area.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  tooltipDiv.innerHTML = `<strong>${name}</strong><br>${formattedArea} m²`;
  tooltipDiv.style.display = "block";
});
poly.addListener("mousemove", e => {
  const proj = tooltipOverlay.getProjection();
  const pos  = proj.fromLatLngToDivPixel(e.latLng);
  tooltipDiv.style.left = pos.x + "px";
  tooltipDiv.style.top  = pos.y + "px";
});
poly.addListener("mouseout", () => {
  tooltipDiv.style.display = "none";
});


poly.addListener("click", () => {
  if (!confirm(`Delete Polygon "${name}"?`)) return;

  

  // 1) Quitar del mapa
  poly.setMap(null);

  // 2) Quitar de tu array en memoria
  window.importedPolygons = window.importedPolygons.filter(p => p !== poly);

  // 3) Reescribir localStorage solo con los que quedan
  const stored = { 
    pins: JSON.parse(localStorage.getItem("importedKMZ")).pins,
    polygons: window.importedPolygons.map(pg => ({
      name:        pg.__name,
      paths:       pg.getPath().getArray().map(c => ({ lat: c.lat(), lng: c.lng() })),
      strokeColor: pg.get("strokeColor"),
      fillColor:   pg.get("fillColor"),
      fillOpacity: pg.get("fillOpacity"),
      clickable:   pg.get("clickable"),
      zIndex:      pg.get("zIndex")
    }))
  };
  localStorage.setItem("importedKMZ", JSON.stringify(stored));
});

              });
            });

            // 4) Guardar siempre objetos serializables
            localStorage.setItem(
              "importedKMZ",
              JSON.stringify({ pins, polygons })
            );
            playSound("sounds/polygon.mp3");

            // 5) Centrar mapa
            const bounds = new google.maps.LatLngBounds();
            window.importedMarkers.forEach(m => bounds.extend(m.getPosition()));
            window.importedPolygons.forEach(poly =>
              poly.getPath().getArray().forEach(pt => bounds.extend(pt))
            );
            map.fitBounds(bounds);
          }
        }).parseKmlString(kmlText);
      });
    });
  };

  reader.readAsArrayBuffer(file);
});

// Para renderizar de nuevo desde storage (p.e. en init)
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
    if (pin.iconUrl) opts.icon = pin.iconUrl;
    const m = new google.maps.Marker(opts);
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
    window.importedPolygons.push(p);
  });
}



function applyPolygonTooltip(polygon, label, extraHtmlFn) {
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