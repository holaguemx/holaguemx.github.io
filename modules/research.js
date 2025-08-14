function saveResearchPin() {
  if (!selectedResearchCoords) {
    alert("No se ha seleccionado una ubicación.");
    return;
  }

  const franchise = document.getElementById("research-franchise").value.trim();
  const operations = document.getElementById("research-operations").value.trim();
  const address    = document.getElementById("research-address").value.trim();
  const location   = document.getElementById("research-location").value.trim();

  if (!franchise || !operations || !address || !location) {
    alert("Por favor llena todos los campos.");
    return;
  }

  // 🔹 Aseguramos tipo número
  const latitude  = Number(selectedResearchCoords.lat());
  const longitude = Number(selectedResearchCoords.lng());

const pinData = {
  Franchise: franchise,
  Operations: operations,
  Address: address,
  Location: location,
  Latitude: latitude,
  Longitude: longitude
};

  const arr = JSON.parse(localStorage.getItem("researchPins") || "[]");
  arr.push(pinData);
  localStorage.setItem("researchPins", JSON.stringify(arr));

  // feedback
  playSound("sounds/bubble.mp3");

  // marcador
  const marker = new google.maps.Marker({
    position: { lat: latitude, lng: longitude },
    map,
    animation: google.maps.Animation.DROP,
    draggable: true,
    icon: {
      url: "https://static.wixstatic.com/media/805cf6_c60c413bdd6545f78929a4d92196dcd5~mv2.png",
      scaledSize: new google.maps.Size(38, 38)
    },
    title: franchise
  });
  marker._pinId = pinData.id;

  // eliminar (lee storage fresco)
  marker.addListener("click", () => {
    if (!confirm(`¿Deseas eliminar "${franchise}"?`)) return;
    marker.setMap(null);
    playSound("sounds/trash.mp3");
    const fresh = JSON.parse(localStorage.getItem("researchPins") || "[]");
    const updated = fresh.filter(p => p.id !== marker._pinId);
    localStorage.setItem("researchPins", JSON.stringify(updated));
  });

  // reset UI
  closeResearchPinForm();
  researchPinMode = false;
  selectedResearchCoords = null;
  map.setOptions({ draggableCursor: null });

  // depuración rápida
  console.table([pinData]);
}





function loadResearchPins() {
  // 1) Recupera tu array de pines con Franchise, Operations, Address, Location, Latitude, Longitude
  const stored = JSON.parse(localStorage.getItem("researchPins") || "[]");

  stored.forEach(pin => {
    // 2) Convierte latitud y longitud a número
    const lat = parseFloat(pin.Latitude);
    const lng = parseFloat(pin.Longitude);

    // 3) Verifica que sean válidos
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      // 4) Crea el marcador
      const marker = new google.maps.Marker({
        position: { lat, lng },
        map: map,
        animation: google.maps.Animation.DROP,
        icon: {
          url: "https://static.wixstatic.com/media/805cf6_c60c413bdd6545f78929a4d92196dcd5~mv2.png",
          scaledSize: new google.maps.Size(38, 38),
        },
        draggable: true,
        title: pin.Franchise || "Research Pin"
      });

      // 5) Al hacer clic, pregunta y elimina tanto del mapa como del localStorage
      marker.addListener("click", () => {
        const confirmDelete = confirm(`¿Deseas eliminar "${pin.Franchise}"?`);
        if (!confirmDelete) return;

        // quita del mapa
        marker.setMap(null);
        playSound("sounds/trash.mp3");

        // filtra el array, removiendo sólo el pin con estas coordenadas exactas
        const updated = stored.filter(p =>
          !(parseFloat(p.Latitude) === lat && parseFloat(p.Longitude) === lng)
        );
        localStorage.setItem("researchPins", JSON.stringify(updated));
      });
    }
  });
}
