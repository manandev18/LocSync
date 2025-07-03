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

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
