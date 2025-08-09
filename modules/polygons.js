

document.getElementById("drawPolygonBtn").addEventListener("click", () => {
    if (!drawingManager) initPolygonDrawing();
    const currentMode = drawingManager.getDrawingMode();
    playSound("sounds/draw.mp3");
  
    drawingManager.setDrawingMode(currentMode ? null : google.maps.drawing.OverlayType.POLYGON);
  });
  
  function initPolygonDrawing() {
    drawingManager = new google.maps.drawing.DrawingManager({
      drawingMode: null,
      drawingControl: false,
      polygonOptions: {
        editable:   false,
        draggable:  false,
        clickable:  true,
        strokeColor: isDarkMode ? "#FFFFFF" : "#FF6600",
        fillColor:   isDarkMode ? "#FF6600" : "#000000",
        fillOpacity: 0.35,
        zIndex:      1
      }
    });
    drawingManager.setMap(map);
  
    // — ÚNICAMENTE un listener aquí —
    google.maps.event.addListener(drawingManager, 'overlaycomplete', event => {
      if (event.type !== google.maps.drawing.OverlayType.POLYGON) return;
      const polygon = event.overlay;
  
      // 1) Pedir nombre
      const name = prompt("Polygon Name?");
      if (!name) {
        polygon.setMap(null);
        return;
      }
  
      // 2) Extraer coordenadas
      const path = polygon.getPath().getArray().map(c => ({
        lat: c.lat(),
        lng: c.lng()
      }));
  
      // 3) Calcular área (m²)
      const rawArea = google.maps.geometry.spherical.computeArea(polygon.getPath());
      const area    = parseFloat(rawArea.toFixed(2));
  
      // 4) Guardar en el array (incluyendo el área)
      customPolygons.push({
        name,
        paths: path,
        area      // ← aquí
      });
      savePolygonsToLocalStorage();
  
      // 5) Mostrar tooltip con área
      polygon.addListener("mouseover", () => {
        const formatted = new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }).format(area);
        tooltipDiv.innerHTML = `<strong>${name}</strong><br>${formatted} m²`;
        tooltipDiv.style.display = "block";
      });
      polygon.addListener("mousemove", e => {
        const pos = tooltipOverlay.getProjection()
                      .fromLatLngToDivPixel(e.latLng);
        tooltipDiv.style.left = pos.x + "px";
        tooltipDiv.style.top  = pos.y + "px";
      });
      polygon.addListener("mouseout", () => {
        tooltipDiv.style.display = "none";
      });
  
      // 6) Resto de lógica (detener dibujo, sonido, borrado…)
      drawingManager.setDrawingMode(null);
      playSound("sounds/polygon.mp3");
      drawnPolygons.push(polygon);
  
      polygon.addListener("click", () => {
        tooltipDiv.style.display = "none";
        if (!confirm(`Delete Polygon "${name}"?`)) return;
        polygon.setMap(null);
        playSound("sounds/trash.mp3");
        drawnPolygons = drawnPolygons.filter(p => p !== polygon);
        customPolygons  = customPolygons.filter(p => p.name !== name);
        removePolygonFromLocalStorage(name);
      });
    });
  }
  
  
  
  
    // customPolygons ahora incluye { name, paths, area }
    function savePolygonsToLocalStorage() {
      const data = customPolygons.map(item => ({
        name:        item.name,
        paths:       item.paths,
        area:        item.area,                         // ← asegurado
        strokeColor: isDarkMode ? "#FFFFFF" : "#FF6600",
        fillColor:   isDarkMode ? "#FF6600" : "#000000",
        fillOpacity: 0.35,
        clickable:   true,
        zIndex:      1
      }));
      localStorage.setItem("customPolygons", JSON.stringify(data));
    }    
  
  

  function removePolygonFromLocalStorage(nameToRemove) {
    const stored = JSON.parse(localStorage.getItem("customPolygons")) || [];
    const updated = stored.filter(p => p.name !== nameToRemove);
    localStorage.setItem("customPolygons", JSON.stringify(updated));
    // actualiza también el array en memoria
    customPolygons = customPolygons.filter(p => p.name !== nameToRemove);
  }
  
  
  function loadPolygonsFromLocalStorage() {
    // 1) Limpia lo anterior
    drawnPolygons.forEach(poly => poly.setMap(null));
    drawnPolygons = [];
    customPolygons = [];
  
    // 2) Recupera y parsea
    const raw = localStorage.getItem("customPolygons");
    if (!raw) return;
    const data = JSON.parse(raw);
  
    data.forEach(item => {
      const { name, paths, area } = item;
      if (!Array.isArray(paths) || paths.length < 3) return;
  
      // 3) Crea el polígono
const pathLatLng = paths.map(coord => new google.maps.LatLng(coord.lat, coord.lng));

const polygon = new google.maps.Polygon({
  paths: pathLatLng,
  strokeColor: isDarkMode ? "#FFFFFF" : "#FF6600",
  fillColor:   isDarkMode ? "#FF6600" : "#000000",
  fillOpacity: item.fillOpacity ?? 0.35,
  map,
  clickable:   true
});
  
      // 4) Guarda el área en customData para usarla luego
      polygon.customData = { name, area };
  
      // 5) Pasa el área guardada al tooltip
      applyPolygonTooltip(polygon, name, () => {
        return `${Number(area).toLocaleString(undefined,{
          minimumFractionDigits:2,
          maximumFractionDigits:2
        })} m²`;
      });
  
      // 6) Guarda referencias
      drawnPolygons.push(polygon);
      customPolygons.push({ name, paths, area });
      
      polygon.addListener("click", () => {
        if (!confirm(`Delete Polygon "${name}"?`)) return;
        polygon.setMap(null);
        removePolygonFromLocalStorage(name);
      });
    });
  
    // 7) Reajusta bounds si quieres
    const bounds = new google.maps.LatLngBounds();
    drawnPolygons.forEach(poly =>
      poly.getPath().getArray().forEach(pt => bounds.extend(pt))
    );
    if (!bounds.isEmpty()) map.fitBounds(bounds);
  }
  

  function applyPolygonTooltip(polygon, name) {
    polygon.__name = name;
    polygon.addListener('mouseover', e => {
      const area = google.maps.geometry.spherical.computeArea(polygon.getPath());
      const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(area);
      tooltipDiv.innerHTML = `<strong>${name}</strong><br>${formatted} m²`;
      tooltipDiv.style.display = 'block';
    });
    polygon.addListener('mousemove', e => {
      const pos = tooltipOverlay.getProjection().fromLatLngToDivPixel(e.latLng);
      tooltipDiv.style.left = pos.x + 'px';
      tooltipDiv.style.top  = pos.y + 'px';
    });
    polygon.addListener('mouseout', () => {
      tooltipDiv.style.display = 'none';
    });
  }

  function getPolygonCenter(polygon) {
    const bounds = new google.maps.LatLngBounds();
    polygon.getPath().forEach(function (path) {
      bounds.extend(path);
    });
    return bounds.getCenter();
  }
