const btnLoad   = document.getElementById('btnLoadExcel');
const fileInput = document.getElementById('fileInputExcel');

btnLoad.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById("export-files-panel")?.style.setProperty('display', 'none');

  const reader = new FileReader();
  reader.onload = e => {
    const data     = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });

    // nombres de hoja
    const names = workbook.SheetNames;
    const mName         = names.find(n => /marker/i.test(n))    || names[0];
    const pName         = names.find(n => /polygon/i.test(n))   || names[1] || names[0];
    const portfolioName = names.find(n => /portfolio/i.test(n)); // detectar hoja Portfolio

    // leer hojas si existen
    const markerRows    = XLSX.utils.sheet_to_json(workbook.Sheets[mName]     || {});
    const polygonRows   = XLSX.utils.sheet_to_json(workbook.Sheets[pName]     || {});
    const portfolioRows = portfolioName
      ? XLSX.utils.sheet_to_json(workbook.Sheets[portfolioName])
      : [];

    // formatea markers
const formattedMarkers = markerRows.map(row => {
  const nameVal = row.Name || row.name || "";
  const latVal  = parseFloat(row.Latitude || row.latitude || row.lat || row.Lat);
  const lngVal  = parseFloat(row.Longitude || row.longitude || row.lng || row.Lng);
  let iconUrl   = row.icon || "";

  if (iconUrl) {
    try { iconUrl = JSON.parse(iconUrl).url; } catch (e) {}
  }

  if (!iconUrl) {
    iconUrl = "https://static.wixstatic.com/media/805cf6_c60c413bdd6545f78929a4d92196dcd5~mv2.png";
  }

  return {
    name: nameVal,
    position: { lat: latVal, lng: lngVal },
    icon: {
      url: iconUrl,
      scaledSize: { width: 30, height: 30 }
    }
  };
}).filter(m => !isNaN(m.position.lat) && !isNaN(m.position.lng));

    // formatea polígonos desde WKT
    const formattedPolygons = polygonRows.map(row => {
      const wkt = String(row.WKT || row.wkt || "").trim();
      let paths = [];
      if (wkt.toUpperCase().startsWith("POLYGON")) {
        const inner = wkt.slice(wkt.indexOf("((") + 2, wkt.lastIndexOf("))"));
        paths = inner.split(",").map(pair => {
          const [lng, lat] = pair.trim().split(/\s+/).map(Number);
          return { lat, lng };
        });
      }
      return { name: row.name || "", paths };
    }).filter(p => p.paths.length >= 3);

    // guardar markers y polígonos en excelData
    localStorage.setItem('excelData', JSON.stringify({
      markers: formattedMarkers,
      polygons: formattedPolygons
    }));

    // guardar portfolioData si hay hoja Portfolio y renderizar
    if (portfolioRows.length > 0) {
      localStorage.setItem("portfolioData", JSON.stringify(portfolioRows));
      console.log(`[Import] ${portfolioRows.length} propiedades cargadas al portafolio.`);
      renderPortfolioProperties(); // ← dibujar en el mapa
    }

    renderAll(formattedMarkers, formattedPolygons);
  };

  reader.readAsArrayBuffer(file);
});

// Función para renderizar propiedades del portafolio
function renderPortfolioProperties() {
  let portfolio = JSON.parse(localStorage.getItem("portfolioData") || "[]");

  portfolio.forEach((item, index) => {
    const lat = parseFloat(item.latitude || item.lat);
    const lng = parseFloat(item.longitude || item.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const marker = new google.maps.Marker({
      position: { lat, lng },
      map,
      title: item.name || item.name || "",
      icon: {
        url: "https://static.wixstatic.com/media/805cf6_f88c89ec4f36480281cad7f3f040be4b~mv2.png",
        scaledSize: new google.maps.Size(38, 38)
      }
    });

    // Tooltip al pasar el mouse
    marker.addListener("mouseover", () => {
      const info = `
        <strong>${item.name || ""}</strong><br>
        Área: ${item.area || "?"} m²<br>
        Precio: ${item.ticket || "?"}<br>
        Portafolio: ${item.portfolio || ""}
      `;
      infoWindow.setContent(info);
      infoWindow.open(map, marker);
    });

    marker.addListener("mouseout", () => {
      infoWindow.close();
    });

    // Eliminar al hacer clic
    marker.addListener("click", () => {
      if (!confirm(`Delete "${item.name}" from Portfolio?`)) return;
      marker.setMap(null); // quitar del mapa

      // Quitar del array y actualizar localStorage
      portfolio.splice(index, 1);
      localStorage.setItem("portfolioData", JSON.stringify(portfolio));
      console.log(`Property "${item.Nombre}" removed.`);
    });
  });
}



// Arrays globales para luego poder limpiar si se desea
let excelMarkers = [];
let excelPolygons = [];

function renderAll(markers = [], polygons = []) {
  // Limpia anteriores si hay
  excelMarkers.forEach(m => m.setMap(null));
  excelPolygons.forEach(p => p.setMap(null));
  excelMarkers = [];
  excelPolygons = [];

  // MARKERS
  markers.forEach(marker => {
    const m = new google.maps.Marker({
      position: marker.position,
      map,
      title: marker.name,
      icon: {
        url: marker.icon?.url || "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        scaledSize: new google.maps.Size(
          marker.icon?.scaledSize?.width || 30,
          marker.icon?.scaledSize?.height || 30
        )
      }
    });
    excelMarkers.push(m);

    // Opcional: Tooltip al pasar el mouse
    m.addListener("mouseover", () => {
      const info = `<strong>${marker.name}</strong>`;
      infoWindow.setContent(info);
      infoWindow.open(map, m);
    });

    m.addListener("mouseout", () => {
      infoWindow.close();
    });

    // Eliminar al hacer clic
    m.addListener("click", () => {
      if (!confirm(`¿Eliminar el marker "${marker.name}"?`)) return;

      // 1. Quitar del mapa
      m.setMap(null);

      // 2. Quitar del array de markers visuales
      excelMarkers.splice(excelMarkers.indexOf(m), 1);

      // 3. Quitar del array de datos originales
      const i = markers.indexOf(marker);
      if (i !== -1) markers.splice(i, 1);

      // 4. Actualizar localStorage
      const currentData = JSON.parse(localStorage.getItem("excelData") || "{}");
      currentData.markers = markers;
      localStorage.setItem("excelData", JSON.stringify(currentData));

      console.log(`Marker "${marker.name}" eliminado.`);
    });
  });

// POLYGONS
polygons.forEach(polygonData => {
  const { name, paths } = polygonData;

  const polygon = new google.maps.Polygon({
    paths,
    map,
    strokeColor: "#FF6600",
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: "#FFA500",
    fillOpacity: 0.2
  });

  // 1) Mostrar tooltip al pasar el mouse
  applyPolygonTooltip(polygon, name);

  // 2) Agregar al array visual
  excelPolygons.push(polygon);

  // 3) Agregar evento de clic para eliminar
  polygon.addListener("click", () => {
    if (!confirm(`¿Eliminar el polígono "${name}"?`)) return;

    // Quitar del mapa
    polygon.setMap(null);

    // Quitar del array visual
    const i = excelPolygons.indexOf(polygon);
    if (i !== -1) excelPolygons.splice(i, 1);

    // Quitar del array de datos originales
    const currentData = JSON.parse(localStorage.getItem("excelData") || "{}");
    if (Array.isArray(currentData.polygons)) {
      const idx = currentData.polygons.findIndex(p => p.name === name);
      if (idx !== -1) {
        currentData.polygons.splice(idx, 1);
        localStorage.setItem("excelData", JSON.stringify(currentData));
        console.log(`Polígono "${name}" eliminado.`);
      }
    }
  });
});
}