document.getElementById('portfolio-options').addEventListener('click', () => {
  const panel = document.getElementById('portfolio-options-panel');
  
  // Alternar clase y visibilidad
  const isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    panel.style.display = 'none';
  } else {
    panel.classList.add('open');
    panel.style.display = 'block';
  }
});



let portfolioSheetURL = "";

document.getElementById('load-portfolio').addEventListener('click', () => {
  const inputURL = prompt("Paste here the Google Sheet URL(public CSV format only):");

  if (!inputURL || !inputURL.includes("docs.google.com")) {
    alert("❌ Ingresa una URL válida de Google Sheets.");
    return;
  }

  let csvURL = inputURL.trim();

  if (csvURL.includes("/edit")) {
    const match = csvURL.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      alert("❌ No se pudo extraer el ID del Google Sheet.");
      return;
    }
    const sheetId = match[1];
    csvURL = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`;
  }

  // Guardar la URL en localStorage
  localStorage.setItem("portfolioSheetURL", csvURL);
  portfolioSheetURL = csvURL;

  fetch(csvURL)
    .then(res => {
      if (!res.ok) throw new Error("Error al descargar el archivo");
      return res.text();
    })
    .then(csvText => {
      const rows = Papa.parse(csvText, { header: true }).data;

      const properties = rows
        .map(row => {
          const lat = parseFloat(row.lat || row.Latitude);
          const lng = parseFloat(row.lng || row.Longitude);
          if (isNaN(lat) || isNaN(lng)) return null;

          return {
            name: row.property || "Propiedad sin nombre",
            location: row.location || "",
            category: row.category || "",
            building: row.building || "",
            land: row.land || "",
            ticket: row.ticket || "",
            status: row.status || "",
            tenant: row.tenant || "",
            rent: row.rent || "",
            cap: row.cap || "",

            portfolio: row.portfolio || "",
            lat, lng
          };
        })
        .filter(p => p);

      renderPortfolioPins(properties);
      alert(`✅ Loaded ${properties.length} properties in the Portfolio`);
    })
    .catch(err => {
      console.error(err);
      alert("❌ Hubo un problema al cargar el archivo.");
    });
});

function renderPortfolioPins(properties) {
  properties.forEach(p => {
    const marker = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      map,
      title: p.name,
      icon: {
        url: "https://static.wixstatic.com/media/805cf6_5664629e1dc04ddf8bd9c500f9552ef6~mv2.png",
        scaledSize: new google.maps.Size(30, 34)
      }
    });

    const tooltipHTML = `
      <strong>${p.name}</strong><br>
      Ubicación: ${p.location}<br>
      Área: ${p.area}<br>
      Precio: ${p.ticket}<br>
      Portafolio: ${p.portfolio}
    `;

    marker.addListener("mouseover", () => {
      infoWindow.setContent(tooltipHTML);
      infoWindow.open(map, marker);
    });

    marker.addListener("mouseout", () => {
      infoWindow.close();
    });

  });
}



function loadPortfolioFromStorage() {
  const savedURL = localStorage.getItem("portfolioSheetURL");
  if (!savedURL) return;

  fetch(savedURL)
    .then(res => res.text())
    .then(csvText => {
      const rows = Papa.parse(csvText, { header: true }).data;

      const properties = rows
        .map(row => {
          const lat = parseFloat(row.lat || row.Latitude);
          const lng = parseFloat(row.lng || row.Longitude);
          if (isNaN(lat) || isNaN(lng)) return null;

          return {
            name: row.property || "Propiedad sin nombre",
            location: row.location || "",
            category: row.category || "",
            building: row.building || "",
            land: row.land || "",
            ticket: row.ticket || "",
            status: row.status || "",
            tenant: row.tenant || "",
            rent: row.rent || "",
            cap: row.cap || "",

            portfolio: row.portfolio || "",
            lat, lng
          };
        })
        .filter(p => p);

      renderPortfolioPins(properties);

      // ✅ Esperar a que desaparezca el #start-screen para mostrar mensaje
      const waitUntilStartScreenGone = setInterval(() => {
        const screen = document.getElementById('start-screen');
        if (!screen || screen.style.display === 'none') {
          clearInterval(waitUntilStartScreenGone);
          alert(`✅ Loaded ${properties.length} properties from the Portolio URL.`);
        }
      }, 300);
    })
    .catch(err => {
      console.error("Error cargando el portafolio inicial:", err);
    });
}


google.charts.load("current", { packages: ["corechart"] });

document.getElementById("portfolio-snapshot").addEventListener("click", async () => {
  const savedURL = localStorage.getItem("portfolioSheetURL");
  if (!savedURL) {
    alert("Error: Portfolio not found, add a Google Sheet URL again.");
    return;
  }

  try {
    const res = await fetch(savedURL);
    const text = await res.text();
    const rows = Papa.parse(text, { header: true }).data;

    const groupedByCategory = {};
    let totalTicket = 0;
    let count = 0;

    const cleanedRows = [];

    rows.forEach(row => {
      const ticketRaw = row.ticket ?? row.Ticket ?? "";
      const ticket = parseFloat(ticketRaw.toString().replace(/[^0-9.]/g, ""));
      const category = row.category?.trim() || "Sin categoría";

      if (!isNaN(ticket)) {
        totalTicket += ticket;
        count++;
        if (!groupedByCategory[category]) groupedByCategory[category] = 0;
        groupedByCategory[category] += ticket;

        cleanedRows.push({
          name: row.property || "Sin nombre",
          category,
          ticket
        });
      }
    });

// 1) Prepara los datos
const categories = Object.keys(groupedByCategory);
const totals     = categories.map(cat => groupedByCategory[cat]);
const maxValue   = Math.max(...totals);
const minValue   = Math.min(...totals);

// 2) Define colores de inicio y fin en RGB
const startRGB = [255, 102, 0];    // #ff6600
const endRGB = [107, 107, 107]; // #FFCC99

// 3) Calcula un mapa categoría→color
const categoryColors = {};
categories.forEach(cat => {
  const value = groupedByCategory[cat];
  // ratio: 0 cuando value===max → startRGB; 1 cuando value===min → endRGB
  const t = (maxValue === minValue)
    ? 0
    : (maxValue - value) / (maxValue - minValue);

  // interpolación RGB
  const r = Math.round(startRGB[0] + t * (endRGB[0] - startRGB[0]));
  const g = Math.round(startRGB[1] + t * (endRGB[1] - startRGB[1]));
  const b = Math.round(startRGB[2] + t * (endRGB[2] - startRGB[2]));

  // convierte a hex "#rrggbb"
  categoryColors[cat] =
    "#" + ((1 << 24) | (r << 16) | (g << 8) | b)
      .toString(16)
      .slice(1);
});

// 4) Llena el DataTable y construye el array de colores
const pieData = new google.visualization.DataTable();
pieData.addColumn("string", "Categoría");
pieData.addColumn("number", "Total Ticket");

categories.forEach(cat => {
  pieData.addRow([cat, groupedByCategory[cat]]);
});

const colors = categories.map(cat => categoryColors[cat]);

// 5) Dibuja el gráfico incluyéndolas
const pieChart = new google.visualization.PieChart(
  document.getElementById("portfolio-popup-chart")
);

pieChart.draw(pieData, {
  pieHole: 0.4,
  chartArea: { width: "100%", height: "100%", top: 40 },
  legend: "none",
  pieSliceText: "percentage",
  pieSliceTextStyle: {
    color: "white",
    fontSize: 12,
    bold: true
  },
  tooltip: { text: "both" },

  // <-- aquí van tus colores degradados -->
  colors: colors
});

    // RESUMEN
    const summaryDiv = document.getElementById("portfolio-summary");
    const formattedTotal = new Intl.NumberFormat("en-US").format(totalTicket);
    summaryDiv.innerHTML = `
      <div style="margin-bottom: 5px;">
        <strong>Portfolio Value:</strong> $${formattedTotal}
      </div>
      <div>
        <strong>${count}</strong> ${count === 1 ? 'property' : 'properties'}
      </div>
    `;

    // SELECT DE CATEGORÍA
    const select = document.getElementById("category-filter");
    const uniqueCategories = [...new Set(cleanedRows.map(r => r.category).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Todas</option>';
    uniqueCategories.forEach(cat => {
      const option = document.createElement("option");
      option.value = cat;
      option.textContent = cat;
      select.appendChild(option);
    });

    // DIBUJAR BARRAS
    drawBarChart(cleanedRows, ""); // muestra todas por default

    // Mostrar popup
    document.getElementById("portfolio-popup").style.display = "block";

  } catch (err) {
    console.error("❌ Error al generar gráfica del portafolio:", err);
    alert("Hubo un error al procesar la gráfica.");
  }
});


function drawBarChart(data, filterCategory = "") {
  const filtered = filterCategory
    ? data.filter(r => r.category === filterCategory)
    : data;

  const top10 = filtered
    .sort((a, b) => b.ticket - a.ticket)
    .slice(0, 5);

  const chartData = new google.visualization.DataTable();
  chartData.addColumn("string", "Propiedad");
  chartData.addColumn("number", "Ticket");

  top10.forEach(item => {
    chartData.addRow([item.name, item.ticket]);
  });

  const chart = new google.visualization.ColumnChart(
    document.getElementById("portfolio-bar-chart")
  );

  chart.draw(chartData, {
    chartArea: { width: "90%", height: "80%" },
    hAxis: { textStyle: { fontSize: 11 } },
    vAxis: { title: "Ticket", format: "short" },
    colors: ["#ff6600"],
    legend: "none"
  });
}

function updateBarChartByCategory() {
  const selected = document.getElementById("category-filter").value;
  // Reutiliza los datos ya limpiados de la función anterior
  const savedURL = localStorage.getItem("portfolioSheetURL");
  if (!savedURL) return;

  fetch(savedURL)
    .then(res => res.text())
    .then(text => {
      const rows = Papa.parse(text, { header: true }).data;
      const cleaned = rows
        .map(r => {
          const t = parseFloat((r.ticket ?? "").toString().replace(/[^0-9.]/g, ""));
          return {
            name: r.property || "Sin nombre",
            category: r.category?.trim() || "Sin categoría",
            ticket: isNaN(t) ? 0 : t
          };
        })
        .filter(r => r.ticket > 0);

      drawBarChart(cleaned, selected);
    });
}

function closePortfolioPopup() {
  document.getElementById("portfolio-popup").style.display = "none";
}
