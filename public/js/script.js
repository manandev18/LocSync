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

// ===== BEAUTIFUL DARK MAP TILES =====
// Using CartoDB Dark Matter theme for a stunning dark map
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  subdomains: 'abcd',
  maxZoom: 20
}).addTo(map);

// Alternative beautiful dark themes (uncomment to try):
// 1. Stamen Toner (High contrast black & white)
// L.tileLayer('https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png', {
//   attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
//   subdomains: 'abcd',
//   maxZoom: 20
// }).addTo(map);

// 2. Esri World Imagery (Satellite view)
// L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
//   attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
// }).addTo(map);

const markers = {};
let myLatLng = null; // Store your location
let routeControl = null; // Store routing control instance
let firstCenter = false;
let chatHistory = {}; // Store chat history

// ===== CUSTOM BEAUTIFUL MARKER ICONS =====
const createCustomIcon = (color, isMe = false) => {
  const size = isMe ? [40, 40] : [32, 32];
  const anchor = isMe ? [20, 40] : [16, 32];
  
  return new L.Icon({
    iconUrl: `data:image/svg+xml;base64,${btoa(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size[0]}" height="${size[1]}">
        <defs>
          <linearGradient id="grad${color}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${color === 'me' ? '#4facfe' : color === 'user' ? '#667eea' : '#fa709a'};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${color === 'me' ? '#00f2fe' : color === 'user' ? '#764ba2' : '#fee140'};stop-opacity:1" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge> 
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <circle cx="12" cy="12" r="8" fill="url(#grad${color})" filter="url(#glow)" stroke="white" stroke-width="2"/>
        <circle cx="12" cy="12" r="3" fill="white" opacity="0.9"/>
        ${isMe ? '<circle cx="12" cy="12" r="1.5" fill="#4facfe"/>' : ''}
      </svg>
    `)}`,
    iconSize: size,
    iconAnchor: anchor,
    popupAnchor: [0, -anchor[1]],
    className: 'custom-marker-icon'
  });
};

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
  const isMe = id === socket.id;
  
  // Use custom beautiful icons
  const customIcon = createCustomIcon(isMe ? 'me' : 'user', isMe);
  
  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
    markers[id].setIcon(customIcon);
    if (username) {
      markers[id].bindPopup(`
        <div style="text-align: center; padding: 0.5rem;">
          <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.5rem; color: #667eea;">
            ${isMe ? '📍 You' : '👤 ' + username}
          </div>
          <div style="font-size: 0.8rem; color: #b8b8d1; margin-bottom: 0.5rem;">
            ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
          </div>
          ${!isMe ? '<div style="font-size: 0.75rem; color: #8b8ba7;">Click to get directions</div>' : ''}
        </div>
      `);
    }
  } else {
    // New marker with custom icon
    const marker = L.marker([latitude, longitude], { icon: customIcon }).addTo(map);
    markers[id] = marker;
    
    if (username) {
      marker.bindPopup(`
        <div style="text-align: center; padding: 0.5rem;">
          <div style="font-weight: 600; font-size: 1rem; margin-bottom: 0.5rem; color: #667eea;">
            ${isMe ? '📍 You' : '👤 ' + username}
          </div>
          <div style="font-size: 0.8rem; color: #b8b8d1; margin-bottom: 0.5rem;">
            ${latitude.toFixed(6)}, ${longitude.toFixed(6)}
          </div>
          ${!isMe ? '<div style="font-size: 0.75rem; color: #8b8ba7;">Click to get directions</div>' : ''}
        </div>
      `).openPopup();
    }
    
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
      // Draw route using Leaflet Routing Machine with custom styling
      routeControl = L.Routing.control({
        waypoints: [
          L.latLng(myLatLng[0], myLatLng[1]),
          L.latLng(targetLatLng[0], targetLatLng[1]),
        ],
        lineOptions: {
          styles: [{ 
            color: "#667eea", 
            opacity: 0.8, 
            weight: 5,
            dashArray: "10, 5"
          }],
        },
        createMarker: () => null,
        addWaypoints: false,
        draggableWaypoints: false,
        routeWhileDragging: false,
        show: true,
        collapsible: true
      }).addTo(map);
      
      // Open chat box on marker click
      if (!isMe) {
        openChatBox(id, username);
      }
    });
  }
});

// Recenter button logic
const recenterBtn = document.getElementById("recenter-btn");
if (recenterBtn) {
  recenterBtn.onclick = function () {
    if (myLatLng) {
      map.setView(myLatLng, 16);
      // Add a subtle zoom animation
      map.flyTo(myLatLng, 16, {
        animate: true,
        duration: 1.5
      });
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
  
  // Highlight the alert sender's marker with pulsing red effect
  for (const id in markers) {
    const marker = markers[id];
    const markerLatLng = marker.getLatLng();
    
    if (
      (data.id && id === data.id) ||
      (Math.abs(markerLatLng.lat - data.latitude) < 0.0001 &&
        Math.abs(markerLatLng.lng - data.longitude) < 0.0001)
    ) {
      // Create pulsing red alert icon
      const alertIcon = new L.Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="40" height="40">
            <defs>
              <linearGradient id="alertGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style="stop-color:#ff4757;stop-opacity:1" />
                <stop offset="100%" style="stop-color:#ff3838;stop-opacity:1" />
              </linearGradient>
              <filter id="alertGlow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
                <feMerge> 
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
            </defs>
            <circle cx="12" cy="12" r="10" fill="url(#alertGrad)" filter="url(#alertGlow)" stroke="white" stroke-width="2"/>
            <text x="12" y="16" text-anchor="middle" fill="white" font-size="12" font-weight="bold">🚨</text>
          </svg>
        `)}`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -40],
        className: 'alert-marker-icon'
      });
      
      const originalIcon = marker.options.icon;
      marker.setIcon(alertIcon);
      
      // Add pulsing animation
      marker.getElement().style.animation = 'markerPulse 1s ease-in-out infinite';
      
      // Restore original icon after 10 seconds
      setTimeout(() => {
        if (originalIcon) {
          marker.setIcon(originalIcon);
          marker.getElement().style.animation = 'markerPulse 2s ease-in-out infinite';
        }
      }, 10000);
      
      break;
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
      
      // Show success feedback with custom styling
      showToast("🚨 Help alert sent to nearby users!");
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