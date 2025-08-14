async function sendResearchPins() {
  const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyocSiZdvBd9AcyNdxV_7Idhbr52z6Uo_5ShEN7m5ZN8Lf0wGmBCsOV2rqDUIRgO281Xg/exec';
  
  const data = JSON.parse(localStorage.getItem('researchPins') || '[]');

  if (!Array.isArray(data) || data.length === 0) {
    alert('No hay registros en localStorage.researchPins');
    return;
  }

  // Valida que TODO ya venga como número y en rango
  const bad = data.filter(p =>
    typeof p.Latitude !== 'number' || !Number.isFinite(p.Latitude) ||
    typeof p.Longitude !== 'number' || !Number.isFinite(p.Longitude) ||
    p.Latitude < -90 || p.Latitude > 90 || p.Longitude < -180 || p.Longitude > 180
  );

  if (bad.length) {
    console.warn('[SEND] registros inválidos (no se enviarán):', bad.slice(0,10));
    alert(`Hay ${bad.length} registro(s) inválido(s) en researchPins. Revisa la consola.`);
    // Si quieres abortar aquí:
    // return;
  }

  // Mapea solo lo necesario (6 columnas)
const mapped = data.map(p => {
  // tolerante: toma lat/lng de varias posibles formas y conviértelas a número
  const lat = (typeof p.Latitude === 'number') ? p.Latitude
            : (p.position && typeof p.position.lat === 'number') ? p.position.lat
            : Number(String(p.Latitude ?? p.lat ?? '').replace(',', '.'));

  const lng = (typeof p.Longitude === 'number') ? p.Longitude
            : (p.position && typeof p.position.lng === 'number') ? p.position.lng
            : Number(String(p.Longitude ?? p.lng ?? '').replace(',', '.'));

  return {
    Franchise:  String(p?.Franchise ?? ''),
    Operations: String(p?.Operations ?? ''),
    Address:    String(p?.Address ?? ''),
    Location:   String(p?.Location ?? ''),
    Latitude:   lat,
    Longitude:  lng
  };
});

  console.table(mapped.slice(0,10).map(r => ({
    Franchise: r.Franchise, Latitude: r.Latitude, Longitude: r.Longitude,
    lat_type: typeof r.Latitude, lng_type: typeof r.Longitude
  })));

  try {
    await fetch(WEB_APP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(mapped)
    });
    alert(`Enviados ${mapped.length} registro(s).`);
    localStorage.removeItem("researchPins");
  } catch (e) {
    console.error(e);
    alert('Error al enviar: ' + e.message);
  }
}
