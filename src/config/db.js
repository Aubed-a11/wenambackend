const mongoose = require('mongoose');

const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.trim()) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }
  await mongoose.connect(uri.trim());
  console.log('MongoDB connecte: ' + mongoose.connection.host);

  // Seed uniquement si la base est vide (1er demarrage)
  const { seedAdmin, seedMenu } = require('../utils/seed');
  await seedAdmin();
  await seedMenu();
};

module.exports = connectDB;
