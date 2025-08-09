// === Configuración inicial ===
const tomtomApiKey = "KRfT1i0GTTicpvhrNY7Xi2nRQMlIGR24";

document.addEventListener("DOMContentLoaded", () => {
  // Calendario para la fecha
  flatpickr("#traffic-date", {
    dateFormat: "Y-m-d",
    maxDate: "today",
    defaultDate: "today"
  });

  // Autocompletado TomTom
  initTomTomAutocomplete("start-location");

  // Toggle del panel UI (opcional)
  document
    .getElementById("traffic-ui-toggle")
    .addEventListener("click", () => {
      const ui = document.getElementById("traffic-analysis-ui");
      ui.style.display = ui.style.display === "none" ? "block" : "none";
    });
});

// === Autocompletado TomTom ===
function initTomTomAutocomplete(inputFieldId) {
  const inputEl = document.getElementById(inputFieldId);
  const tomtomSearchBox = new tt.plugins.SearchBox(tt.services, {
    searchOptions: {
      key: tomtomApiKey,
      language: "es-MX",
      limit: 5
    }
  });
  tomtomSearchBox.attachTo(inputEl);
}

// === Función para asignar color según P50 ===
function getSpeedColor(p50) {
  if (p50 == null) return "#888888";
  if (p50 < 20)    return "#d73027";
  if (p50 < 40)    return "#fee08b";
  return "#1a9850";
}

// === Mostrar/Ocultar tramos reales de tráfico ===
let trafficPolylineList = [];
let trafficIsVisible = false;

function drawTrafficVolumeBySegment() {
  if (trafficIsVisible) {
    // Toggle off
    trafficPolylineList.forEach(poly => poly.setMap(null));
    trafficPolylineList = [];
    trafficIsVisible = false;
    return;
  }

  // 1) Cargar índice de GeoJSON
  fetch("files/tomtom/index.json")
    .then(res => {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    // 2) Descargar en paralelo cada archivo listado
    .then(fileNames => {
      return Promise.all(
        fileNames.map(name =>
          fetch(`files/tomtom/${name}`)
            .then(res => {
              if (!res.ok) throw new Error("HTTP " + res.status);
              return res.json();
            })
        )
      );
    })
    // 3) Dibujar cada GeoJSON
    .then(geojsonArray => {
      geojsonArray.forEach(geojson => {
        console.log("GeoJSON cargado:", geojson.features.length, "features");

        geojson.features.forEach(feature => {
          if (!feature.geometry?.coordinates) return;

          const props  = feature.properties;
          const coords = feature.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));

          // Extraer P50 de ejemplo ("6:00-9:00")
          let p50 = null;
          if (props.timeSets?.["6:00-9:00"]) {
            p50 = props.timeSets["6:00-9:00"].speedPercentiles[9];
          }
          const color = getSpeedColor(p50);

          // Dibujar polyline
          const polyline = new google.maps.Polyline({
            path: coords,
            strokeColor: color,
            strokeOpacity: 0.9,
            strokeWeight: 4,
            map: map
          });

          // InfoWindow con chart y tooltip personalizado
          polyline.addListener("click", () => {
            const timeSets     = props.timeSets || {};
            const totalVehicles = Object.values(timeSets)
              .reduce((sum, d) => sum + (d.sampleSize || 0), 0);

            // IDs únicos para el contenedor del chart
            const segmentId   = props.segmentId || props.streetName.replace(/\W/g, '');
            const containerId = `traffic-chart-${segmentId}`;

            const formattedTotal = totalVehicles.toLocaleString('en-US');
            const html = `
              <div style="
                  font-family:Arial,sans-serif;
                  font-size:12px;
                  width:325px;
                  text-align:center;
                ">
                <strong style="display:block; font-size:14px; margin-bottom:4px;">
                  ${props.streetName}
                </strong>
                <div style="margin-bottom:12px; font-size:12px; color:#555;">
                  Total Monthly Vehicles: ${formattedTotal}
                </div>
                <div
                  id="${containerId}"
                  style="
                    width:100%;
                    height:225px;
                    margin:0 auto;
                  "
                ></div>
              </div>`;

            const infoWindow = new google.maps.InfoWindow({
              content: html,
              position: coords[0]
            });
            infoWindow.open(map);

            google.maps.event.addListenerOnce(infoWindow, 'domready', () => {
              // 1) Preparar datos para Google Charts
              const dataArray = [
                ['Horario', 'Cantidad', { role: 'annotation' }, { role: 'tooltip' }]
              ];
              Object.entries(timeSets).forEach(([ts, d]) => {
                const count = d.sampleSize || 0;
                const miles = count / 1000;
                const pct   = totalVehicles
                  ? ((count / totalVehicles) * 100).toFixed(1) + '%'
                  : '0%';
                dataArray.push([ts, miles, miles.toFixed(1), pct]);
              });

              // 2) Calcular tope Y
              const valores = dataArray.slice(1).map(r => r[1]);
              let maximo = Math.max(...valores) * 1.25;
              if (maximo <= 0) maximo = 1;

              // 3) Configurar opciones del chart
              const options = {
                colors: ['#FF6600'],
                legend: { position: 'none' },
                annotations: {
                  alwaysOutside: true,
                  textStyle: { fontSize: 10, color: '#000' }
                },
                tooltip: { trigger: 'focus' },
                vAxis: {
                  title: 'Count (thousands)',
                  format: 'decimal',
                  minValue: 0,
                  maxValue: maximo,
                  gridlines: { count: 6 }
                },
                hAxis: {
                  title: 'Day Segments',
                  slantedText: true,
                  slantedTextAngle: 90,
                  textStyle: { fontSize: 9 },
                  showTextEvery: 1,
                  allowContainerBoundaryTextCutoff: false
                },
                chartArea: {
                  left: 35, right: 35, top: 10, bottom: 120,
                  width: '65%', height: '85%'
                }
              };

              // 4) Dibujar chart
              const data  = google.visualization.arrayToDataTable(dataArray);
              const chart = new google.visualization.ColumnChart(
                document.getElementById(containerId)
              );
              chart.draw(data, options);

              // 5) Asegurar que no queden scrollbars
              const iwOuter = document.querySelector('.gm-style-iw');
              if (iwOuter) {
                const panes = iwOuter.querySelectorAll('.gm-style-iw-d');
                panes.forEach(div => {
                  div.style.overflow  = 'visible';
                  div.style.maxHeight = 'none';
                  div.style.maxWidth  = 'none';
                });
              }
            });
          });

          trafficPolylineList.push(polyline);
        });
      });

      // Marcar como visible
      trafficIsVisible = true;
    })
    .catch(err => {
      console.error("Error cargando GeoJSON de tramos reales:", err);
    });
}


