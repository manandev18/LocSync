const express = require("express");
const app = express();
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const server = http.createServer(app);
const io = socketio(server);
const { authenticateSocket } = require("./middleware/jwt");
const authRoutes = require("./routes/auth");
const connectDB = require("./DB/config");

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
  socket.on("disconnect", () => {
    console.log("Client disconnected");
    delete clientLocations[socket.id];
    delete clientUsernames[socket.id];
    io.emit("user-disconnected", socket.id);
  });
});

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
