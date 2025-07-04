// Get token from localStorage and connect to socket.io with auth
// Register service worker and subscribe to push
if ("serviceWorker" in navigator && "PushManager" in window) {
  navigator.serviceWorker
    .register("/service-worker.js")
    .then(function (reg) {
      console.log("Service Worker registered!", reg);

      // Ask for push permission and subscribe
      reg.pushManager.getSubscription().then(function (sub) {
        if (!sub) {
          // Replace with your VAPID public key (Base64 URL-encoded)
          const vapidPublicKey =
            "BIPOUTR2ynVYnzBymAuw6ooLXYENn_uIyCSjAQQw39ajahEK2KhPGxJ1r8EvRA-hmbndtUjuwYbgYutRvl4PWMY";
          const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
          reg.pushManager
            .subscribe({
              userVisibleOnly: true,
              applicationServerKey: convertedVapidKey,
            })
            .then(function (subscription) {
              // Send subscription to server
              fetch("/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(subscription),
              });
            });
        }
      });
    })
    .catch(function (err) {
      console.error("Service Worker registration failed:", err);
    });
}

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
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
let firstCenter = false;
let chatHistory = {}; // Store chat history

// Track your own location and send to server
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      myLatLng = [latitude, longitude];
      socket.emit("sendlocation", { latitude, longitude });
      if (!firstCenter) {
        document.getElementById("map").style.display = "block";
        map.setView(myLatLng, 16);
        map.invalidateSize();
        firstCenter = true;
      }
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

// Toast notification for mobile/in-app fallback
function showToast(message) {
  let toast = document.getElementById("custom-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "custom-toast";
    toast.style.position = "fixed";
    toast.style.bottom = "40px";
    toast.style.left = "50%";
    toast.style.transform = "translateX(-50%)";
    toast.style.background = "#333";
    toast.style.color = "#fff";
    toast.style.padding = "12px 24px";
    toast.style.borderRadius = "8px";
    toast.style.fontSize = "1rem";
    toast.style.zIndex = 3000;
    toast.style.boxShadow = "0 2px 8px rgba(31,38,135,0.18)";
    toast.style.display = "none";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => {
    toast.style.display = "none";
  }, 4000);
}

socket.on("private-message", ({ from, fromUsername, message }) => {
  openChatBox(from, fromUsername || "User");
  const chatBox = document.getElementById("chatbox-" + from);
  appendMessage(chatBox, fromUsername || "User", message);
  if (!chatHistory[from]) chatHistory[from] = [];
  chatHistory[from].push({ sender: fromUsername || "User", message });
  // Show browser notification or fallback toast/alert for mobile
  if (window.Notification && Notification.permission === "granted") {
    new Notification("New message", {
      body: `${fromUsername || "User"}: ${message}`,
      icon: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png",
    });
  } else if (/Mobi|Android/i.test(navigator.userAgent)) {
    showToast(`New message from ${fromUsername || "User"}: ${message}`);
  } else {
    alert(`New message from ${fromUsername || "User"}: ${message}`);
  }
});

// Listen for location updates from other users/devices
socket.on("locationupdate", (data) => {
  const { id, latitude, longitude, username } = data;
  // No automatic recentering here!
  const isMe = id === socket.id;
  const myIcon = new L.Icon({
    iconUrl: "https://maps.google.com/mapfiles/ms/icons/green-dot.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
    if (isMe) markers[id].setIcon(myIcon);
    if (username) markers[id].bindPopup(username);
  } else {
    // New marker
    const marker = L.marker(
      [latitude, longitude],
      isMe ? { icon: myIcon } : undefined
    ).addTo(map);
    markers[id] = marker;
    if (username) marker.bindPopup(username).openPopup();
    // Add click event to draw route from you to the marker
    marker.on("click", () => {
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
      // Open chat box on marker click
      openChatBox(id, username);
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

// Remove marker when user disconnects
socket.on("user-disconnected", (id) => {
  console.log("Client disconnected:", id);
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});
// ✅ Clear route and close all chatboxes when clicking anywhere else on the map
map.on("click", (e) => {
  if (routeControl) {
    map.removeControl(routeControl);
    routeControl = null;
  }
  // Only close chatboxes if the click is not on a marker
  if (!e.originalEvent.target.classList.contains("leaflet-marker-icon")) {
    clearAllChats();
  }
});

// Request notification permission on load
if (window.Notification && Notification.permission !== "granted") {
  Notification.requestPermission();
}

socket.on("alert-notification", (data) => {
  // Show browser notification or fallback toast/alert for mobile
  if (window.Notification && Notification.permission === "granted") {
    new Notification("🚨 Help needed near you!", {
      body: `User ${data.username} needs help at (${data.latitude}, ${data.longitude})`,
      icon: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png",
    });
  } else if (/Mobi|Android/i.test(navigator.userAgent)) {
    showToast(
      `🚨 Help needed near you! User ${data.username} at (${data.latitude}, ${data.longitude})`
    );
  } else {
    alert(
      `🚨 Help needed near you! User ${data.username} at (${data.latitude}, ${data.longitude})`
    );
  }
  // Highlight the alert sender's marker (by coordinates or username)
  for (const id in markers) {
    const marker = markers[id];
    const markerLatLng = marker.getLatLng();
    // If you have user ID, you can match by id === data.id
    if (
      (data.id && id === data.id) ||
      (Math.abs(markerLatLng.lat - data.latitude) < 0.0001 &&
        Math.abs(markerLatLng.lng - data.longitude) < 0.0001)
    ) {
      const originalIcon = marker.options.icon;
      const redIcon = new L.Icon({
        iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      marker.setIcon(redIcon);
      setTimeout(() => {
        if (originalIcon) marker.setIcon(originalIcon);
      }, 10000);
    }
  }
});

function openChatBox(userId, username) {
  let chatbox = document.getElementById("chatbox-" + userId);
  if (!chatbox) {
    chatbox = document.createElement("div");
    chatbox.id = "chatbox-" + userId;
    chatbox.className = "chatbox";
    chatbox.innerHTML = `
     <div class="chat-header">Chat with ${username} <span class="close-chat" style="cursor:pointer;float:right;">&times;</span></div>
      <div class="chat-messages" style="height:120px;overflow-y:auto;"></div>
      <input type="text" class="chat-input" placeholder="Type a message..." style="width:80%;">
      <button class="send-chat-btn">Send</button>
   `;
    document.body.appendChild(chatbox);

    chatbox.querySelector(".close-chat").onclick = () => chatbox.remove();
    chatbox.querySelector(".send-chat-btn").onclick = () => {
      const input = chatbox.querySelector(".chat-input");
      const message = input.value.trim();
      if (message) {
        socket.emit("private-message", {
          to: userId,
          message: message,
          fromUsername: localStorage.getItem("username") || "Unknown",
        });
        appendMessage(chatbox, "You", message);
        if (!chatHistory[userId]) chatHistory[userId] = [];
        chatHistory[userId].push({ sender: "You", message });
        input.value = "";
      }
    };
    chatbox.style.display = "block";
  }
  // Render chat history
  const messagesDiv = chatbox.querySelector(".chat-messages");
  messagesDiv.innerHTML = "";
  if (chatHistory[userId]) {
    chatHistory[userId].forEach(({ sender, message }) => {
      appendMessage(chatbox, sender, message);
    });
  }
}

function appendMessage(chatBox, sender, message) {
  const msgDiv = document.createElement("div");
  msgDiv.textContent = `${sender}: ${message}`;
  chatBox.querySelector(".chat-messages").appendChild(msgDiv);
  chatBox.querySelector(".chat-messages").scrollTop =
    chatBox.querySelector(".chat-messages").scrollHeight;
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

// Clear all chat boxes on logout
function clearAllChats() {
  document.querySelectorAll(".chatbox").forEach((box) => box.remove());
}

document.getElementById("logout-btn").onclick = function () {
  localStorage.removeItem("token");
  document.getElementById("map").style.display = "none";
  document.getElementById("logout-btn").style.display = "none";
  document.getElementById("auth-container").style.display = "block";
  clearAllChats();
  location.reload();
};

console.log("Client script loaded");
