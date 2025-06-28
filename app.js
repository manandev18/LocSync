const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);

app.get("/", function (req, res) {
  //   res.send("hey");
  res.render("index");
});

const clientLocations = {};

io.on("connection", (socket) => {
  console.log("New client connected");

  // Send all existing client locations to the newly connected client
  Object.entries(clientLocations).forEach(([id, loc]) => {
    socket.emit("locationupdate", { id, ...loc });
  });

  socket.on("sendlocation", (data) => {
    console.log("Location data received:", data);
    clientLocations[socket.id] = data;
    io.emit("locationupdate", { id: socket.id, ...data });

    // Here you can handle the location data, e.g., store it or broadcast it
  });
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    delete clientLocations[socket.id];
    io.emit("user-disconnected", socket.id);
  });
});

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
