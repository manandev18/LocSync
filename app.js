const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);
const { authenticateSocket } = require("./middleware/jwt");
const authRoutes = require("./routes/auth");
const connectDB = require("./db/config");
const PORT = process.env.PORT || 3000;

connectDB();

app.get("/", function (req, res) {
  //   res.send("hey");
  res.render("index");
});

app.use(express.json());
app.use(authRoutes);

const clientLocations = {};
const clientUsernames = {};

io.use(authenticateSocket);

io.on("connection", (socket) => {
  console.log("New client connected");
  clientUsernames[socket.id] = socket.username;

  // Send all existing client locations to the newly connected client
  Object.entries(clientLocations).forEach(([id, loc]) => {
    socket.emit("locationupdate", {
      id,
      ...loc,
      username: clientUsernames[id],
    });
  });

  socket.on("sendlocation", (data) => {
    console.log("Location data received:", data);
    clientLocations[socket.id] = data;
    io.emit("locationupdate", {
      id: socket.id,
      ...data,
      username: socket.username,
    });
  });
  socket.on("sendalert", (data) => {
    console.log("Alert received:", data);
    const { latitude, longitude, username } = data;
    const RADIUS = 100000; // 1 km radius
    for (const [id, loc] of Object.entries(clientLocations)) {
      if (
        id !== socket.id &&
        isWithinRadius(latitude, longitude, loc.latitude, loc.longitude, RADIUS)
      ) {
        io.to(id).emit("alert-notification", {
          latitude,
          longitude,
          username,
        });
      }
    }
    // Send push notification to all subscribers
    sendPushToAll(
      "🚨 Help needed near you!",
      `User ${username} needs help at (${latitude}, ${longitude})`
    );
  });
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    delete clientLocations[socket.id];
    delete clientUsernames[socket.id];
    io.emit("user-disconnected", socket.id);
  });

  socket.on("private-message", ({ to, message, fromUsername }) => {
    io.to(to).emit("private-message", {
      from: socket.id,
      fromUsername,
      message,
    });
  });
});

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

// Haversine formula to check distance in meters
function isWithinRadius(lat1, lon1, lat2, lon2, radius) {
  function toRad(x) {
    return (x * Math.PI) / 180;
  }
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c <= radius;
}
const webpush = require("web-push");
const subscriptions = []; // In production, store in DB

webpush.setVapidDetails(
  "mailto:your@email.com",
  "BIPOUTR2ynVYnzBymAuw6ooLXYENn_uIyCSjAQQw39ajahEK2KhPGxJ1r8EvRA-hmbndtUjuwYbgYutRvl4PWMY",
  "lfGEG4-zdBzBpWB8D_CSwB5z0gf6Cp9OJW2oGKc872s"
);

app.post("/subscribe", express.json(), (req, res) => {
  const subscription = req.body;
  subscriptions.push(subscription);
  res.status(201).json({});
});

// Example: Send push to all subscribers (call this when you want to notify)
function sendPushToAll(title, body) {
  subscriptions.forEach((sub) => {
    webpush
      .sendNotification(
        sub,
        JSON.stringify({
          title,
          body,
          icon: "https://cdn-icons-png.flaticon.com/512/1828/1828843.png",
        })
      )
      .catch((err) => console.error(err));
  });
}
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
