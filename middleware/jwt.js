const jwt = require("jsonwebtoken");

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// Add a helper for socket.io authentication
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication error: No token"));
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return next(new Error("Authentication error: Invalid token"));
    socket.username = user.username;
    next();
  });
}

module.exports = { authenticateToken, authenticateSocket };
