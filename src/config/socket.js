const { Server } = require('socket.io');

let io;

const initSocket = (server) => {
  io = new Server(server, {
    cors: { origin: ['https://www.wenamfood.com', 'https://wenamfood.com', 'http://localhost:5173'], credentials: true },
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connecté: ${socket.id}`);

    socket.on('join_room', (userId) => {
      if (userId) {
        socket.join(`user_${userId}`);
        socket.join('admins');
        console.log(`👤 User ${userId} rejoint sa room`);
      }
    });

    socket.on('join_admin', () => {
      socket.join('admins');
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket déconnecté: ${socket.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io non initialisé');
  return io;
};

module.exports = { initSocket, getIO };
