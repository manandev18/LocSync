// Get token from localStorage and connect to socket.io with auth
const token = localStorage.getItem("token");
const socket = io({
  auth: { token },
});

// Show map only after authentication
function showMap() {
  document.getElementById("map").style.display = "block";
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
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

const map = L.map("map").setView([0, 0], 10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "Open StreetMap",
}).addTo(map);

const markers = {};
socket.on("locationupdate", (data) => {
  const { id, latitude, longitude, username } = data;
  map.setView([latitude, longitude], 20);
  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
    if (username) markers[id].bindPopup(username);
  } else {
    markers[id] = L.marker([latitude, longitude]).addTo(map);
    if (username) markers[id].bindPopup(username).openPopup();
  }
});

socket.on("user-disconnected", (id) => {
  console.log("Client disconnected");
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});
console.log("hey");
