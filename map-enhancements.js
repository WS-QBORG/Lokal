
// map-enhancements.js

// Ustawienia klastra z eleganckim wyglądem
const clusterOptions = {
  iconCreateFunction: function (cluster) {
    const count = cluster.getChildCount();
    let className = 'marker-cluster-small';
    if (count >= 100) className = 'marker-cluster-large';
    else if (count >= 10) className = 'marker-cluster-medium';
    return new L.DivIcon({
      html: `<div><span>${count}</span></div>`,
      className: className,
      iconSize: L.point(40, 40)
    });
  }
};

// Przykład użycia klastra:
// const markerCluster = L.markerClusterGroup(clusterOptions);
// markerCluster.addLayer(marker);

// Funkcja do tworzenia popupów z klasą 'custom-dark-popup'
function bindDarkPopup(marker, html) {
  marker.bindPopup(html, {
    className: 'custom-dark-popup'
  });
}
