const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

let io;

// Utilisateur du jeton (envoye a la connexion dans auth.token, ou avec l'evenement)
async function userFrom(socket, token) {
  const t = (typeof token === 'string' && token) || socket.handshake.auth?.token;
  if (!t) return null;
  try {
    const decoded = jwt.verify(t, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('role isActive');
    return user && user.isActive ? user : null;
  } catch {
    return null;
  }
}

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: ['https://www.wenamfood.com', 'https://wenamfood.com', 'http://localhost:5173'], credentials: true },
  });

  io.on('connection', (socket) => {
    // Suivi de ses propres commandes : la salle est celle de l'utilisateur du jeton
    socket.on('join_room', async (_userId, token) => {
      const user = await userFrom(socket, token);
      if (!user) return;
      socket.join(`user_${user._id}`);
      if (user.role === 'admin') socket.join('admins');
    });

    // Alertes de l'equipe (nouvelles commandes, reçus MIAWEZON) : admins connectes uniquement
    socket.on('join_admin', async (token) => {
      const user = await userFrom(socket, token);
      if (user?.role === 'admin') socket.join('admins');
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io non initialisé');
  return io;
};

module.exports = { initSocket, getIO };
