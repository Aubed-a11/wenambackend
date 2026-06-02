require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./config/socket');

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);
initSocket(server);

connectDB().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Wénam Server démarré sur http://localhost:${PORT}`);
    console.log(`📡 Socket.io prêt`);
    console.log(`🔑 Admin: admin@wenam.ma / Admin@2025`);
    console.log(`🌐 Frontend: http://localhost:5173`);
  });
}).catch(err => {
  console.error('Erreur démarrage:', err);
  process.exit(1);
});
