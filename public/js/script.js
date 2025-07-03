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

  // No automatic recentering here!
  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
    if (username) markers[id].bindPopup(username);
  } else {
    // New marker
    markers[id] = L.marker([latitude, longitude]).addTo(map);
    if (username) markers[id].bindPopup(username).openPopup();
    map.setView([latitude, longitude], 16);

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

// Recenter button logic
const recenterBtn = document.getElementById("recenter-btn");
if (recenterBtn) {
  recenterBtn.onclick = function () {
    if (myLatLng) {
      map.setView(myLatLng, 16);
    } else {
      alert("Waiting for your location...");
    }
  };
}
const alertBtn = document.getElementById("alert-btn");
if (alertBtn) {
  alertBtn.onclick = function () {
    if (myLatLng) {
      // Get username from localStorage or prompt (adjust as needed)
      let username = localStorage.getItem("username");
      if (!username) {
        username = prompt("Enter your username for the alert:");
        if (username) localStorage.setItem("username", username);
      }
      socket.emit("sendalert", {
        latitude: myLatLng[0],
        longitude: myLatLng[1],
        username: username || "Unknown",
      });
      alert("Help alert sent!");
    } else {
      alert("Waiting for your location...");
    }
  };
}

// Request notification permission on load
if (window.Notification && Notification.permission !== "granted") {
  Notification.requestPermission();
}

socket.on("alert-notification", (data) => {
  // Use Notification API if available
  if (window.Notification && Notification.permission === "granted") {
    new Notification("🚨 Help needed near you!", {
      body: `User ${data.username} needs help at (${data.latitude}, ${data.longitude})`,
      icon: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png",
    });
  }
  // Highlight the alert sender's marker
  for (const id in markers) {
    const marker = markers[id];
    const markerLatLng = marker.getLatLng();
    // Check by coordinates (rounded for floating point safety)
    if (
      Math.abs(markerLatLng.lat - data.latitude) < 0.0001 &&
      Math.abs(markerLatLng.lng - data.longitude) < 0.0001
    ) {
      // Change icon to red for 5 seconds
      const originalIcon = marker.options.icon;
      const redIcon = new L.Icon({
        iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      marker.setIcon(redIcon);
      marker.openPopup();
      setTimeout(() => {
        if (originalIcon) marker.setIcon(originalIcon);
      }, 10000);
    }
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
