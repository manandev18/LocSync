// Get token from localStorage and connect to socket.io with auth
const token = localStorage.getItem("token");
const socket = io({
  auth: { token },
});

// Show map only after authentication
function showMap() {
  document.getElementById("map").style.display = "block";
}

const map = L.map("map").setView([0, 0], 10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "Open StreetMap",
}).addTo(map);

const markers = {};
let myLatLng = null; // Store your location
let routeControl = null; // Store routing control instance

// Track your own location and send to server
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      myLatLng = [latitude, longitude];
      socket.emit("sendlocation", { latitude, longitude });
    },
    (error) => {
      console.error("Error getting location:", error);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 2000,
    }
  );
}

// Listen for location updates from other users/devices
socket.on("locationupdate", (data) => {
  const { id, latitude, longitude, username } = data;
  map.setView([latitude, longitude], 20);

  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
    if (username) markers[id].bindPopup(username);
  } else {
    // New marker
    markers[id] = L.marker([latitude, longitude]).addTo(map);
    if (username) markers[id].bindPopup(username).openPopup();

    // Add click event to draw route from you to the marker
    markers[id].on("click", () => {
      if (!myLatLng) {
        alert("Waiting for your location...");
        return;
      }

      const targetLatLng = [latitude, longitude];

      // Remove existing route
      if (routeControl) {
        map.removeControl(routeControl);
      }

      // Draw route using Leaflet Routing Machine
      routeControl = L.Routing.control({
        waypoints: [
          L.latLng(myLatLng[0], myLatLng[1]),
          L.latLng(targetLatLng[0], targetLatLng[1]),
        ],
        lineOptions: {
          styles: [{ color: "blue", opacity: 0.7, weight: 6 }],
        },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
      }).addTo(map);
    });
  }
});

// Remove marker when user disconnects
socket.on("user-disconnected", (id) => {
  console.log("Client disconnected:", id);
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});
// ✅ Clear route when clicking anywhere else on the map
map.on("click", () => {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
});

console.log("Client script loaded");
