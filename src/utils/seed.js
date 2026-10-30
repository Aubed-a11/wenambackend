const User = require('../models/User')
const MenuItem = require('../models/MenuItem')

// Vrai menu Wénam avec photos Unsplash illustratives
const menuData = [
  // ── ENTRÉES / PETITS DÉJ ──
  { name: "Salade complète au blanc de poulet", description: "Salade fraîche garnir de blanc de poulet grillé ou de viande hachée, légumes croquants et vinaigrette maison", price: 39.99, category: "entrees", preparationTime: 10, rating: 4.7, reviewCount: 48, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500" },
  { name: "Bouillie de riz au lait", description: "Bouillie douce et crémeuse de riz cuit au lait, sucrée et parfumée — idéale en petit déjeuner", price: 29.99, category: "entrees", preparationTime: 10, rating: 4.5, reviewCount: 32, isAvailable: true, image: "https://images.unsplash.com/photo-1547592166-23ac45744acd?w=500" },
  { name: "Boulie de tapioca au lait", description: "Bouillie légère de tapioca cuite au lait, naturellement sucrée et très digeste", price: 24.99, category: "entrees", preparationTime: 10, rating: 4.4, reviewCount: 26, isAvailable: true, image: "https://images.unsplash.com/photo-1559598467-f8b76c8155d0?w=500" },
  { name: "Entrée chaude / hors d'œuvre", description: "Assortiment de hors d'œuvres chauds préparés à la commande selon disponibilité du jour", price: 49.99, category: "entrees", preparationTime: 15, rating: 4.6, reviewCount: 19, isAvailable: true, image: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=500" },
  { name: "Vermicelles chinoises au gésier / viande hachée", description: "Vermicelles sautées aux gésiers de poulet ou à la viande hachée épicée, style africain", price: 39.99, category: "entrees", preparationTime: 15, rating: 4.6, reviewCount: 34, isAvailable: true, image: "https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=500" },

  // ── PLATS PRINCIPAUX ──
  { name: "Piron / Êba au poulet", description: "Pâte de farine de gari (foufou de manioc) servie avec aileron ou cuisse de poulet mijoté en sauce", price: 69.99, category: "plats_principaux", preparationTime: 30, rating: 4.8, reviewCount: 87, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500" },
  { name: "Amiwô (pâte rouge de maïs) au poulet", description: "Pâte rouge à base de farine de maïs, accompagnée d'aileron ou de cuisse de poulet en sauce pimentée", price: 69.99, category: "plats_principaux", preparationTime: 30, rating: 4.7, reviewCount: 62, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=500" },
  { name: "Atassi tchigan (poisson + oeuf / wagashi)", description: "Riz aux haricots à la sauce tomate épicée, accompagné de poisson braisé, d'œuf dur ou de fromage wagashi grillé", price: 67.49, category: "plats_principaux", preparationTime: 25, rating: 4.6, reviewCount: 41, isAvailable: true, image: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=500" },
  { name: "Akassa / Agbéli + sauce légume", description: "Pâte de maïs fermentée accompagnée d'une sauce légumes riche, servie avec 3 ou 4 pièces de viande", price: 84.99, category: "plats_principaux", preparationTime: 30, rating: 4.7, reviewCount: 55, isAvailable: true, image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500" },
  { name: "Attiéké poulet / poisson / gésiers sautés", description: "Semoule de manioc fermentée (attiéké) accompagnée de poulet grillé, poisson braisé ou gésiers sautés", price: 74.99, category: "plats_principaux", preparationTime: 25, rating: 4.8, reviewCount: 93, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1544025162-d76694265947?w=500" },
  { name: "Yassa poulet", description: "Poulet mariné à la moutarde, citron et oignons caramélisés, mijotés lentement — spécialité sénégalaise", price: 59.99, category: "plats_principaux", preparationTime: 35, rating: 4.9, reviewCount: 108, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c5?w=500" },
  { name: "Jollof rice (riz au gras) + poulet / poisson", description: "Riz cuit dans une sauce tomate épicée aux épices ouest-africaines, accompagné de poulet ou de poisson braisé", price: 64.99, category: "plats_principaux", preparationTime: 30, rating: 4.8, reviewCount: 76, isAvailable: true, image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=500" },
  { name: "Ablo (10 pièces) + poisson / 1/4 poulet", description: "Gâteau vapeur de maïs fermenté (10 pièces) servi avec poisson braisé ou quart de poulet grillé", price: 59.99, category: "plats_principaux", preparationTime: 35, rating: 4.6, reviewCount: 44, isAvailable: true, image: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=500" },

  // ── GRILLADES ──
  { name: "Poulet entier braisé bicyclette / goliath", description: "Poulet entier mariné aux épices africaines et braisé sur charbon — taille bicyclette (petit) ou goliath (grand)", price: 64.99, category: "plats_principaux", preparationTime: 45, rating: 4.9, reviewCount: 120, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=500" },
  { name: "Poisson braisé carpe / loup bar", description: "Poisson frais braisé sur charbon avec épices maison — carpe (25cc) ou loup bar (40cc)", price: 64.99, category: "plats_principaux", preparationTime: 35, rating: 4.7, reviewCount: 67, isAvailable: true, image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500" },
  { name: "Brochettes de blanc de poulet", description: "Brochettes de filet de poulet marinées et grillées sur charbon, accompagnées de sauce piquante", price: 39.99, category: "plats_principaux", preparationTime: 20, rating: 4.6, reviewCount: 52, isAvailable: true, image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=500" },
  { name: "Choukouya de poulet", description: "Poulet rôti à la broche, épicé et fumé selon la tradition du choukouya ouest-africain", price: 44.99, category: "plats_principaux", preparationTime: 40, rating: 4.8, reviewCount: 81, isAvailable: true, image: "https://images.unsplash.com/photo-1598103442097-8b74394b95c5?w=500" },
  { name: "Tchantchanga / Suya (bœuf) au kg", description: "Viande de bœuf marinée aux épices suya (cacahuètes, gingembre, piment), grillée au feu de bois", price: 79.99, category: "plats_principaux", preparationTime: 30, rating: 4.9, reviewCount: 63, isAvailable: true, image: "https://images.unsplash.com/photo-1529042410759-befb1204b468?w=500" },

  // ── ACCOMPAGNEMENTS ──
  { name: "Riz blanc", description: "Riz blanc cuit à la vapeur, moelleux et parfait pour accompagner tous les plats en sauce", price: 14.99, category: "entrees", preparationTime: 10, rating: 4.3, reviewCount: 88, isAvailable: true, image: "https://images.unsplash.com/photo-1536304929831-ee1ca9d44906?w=500" },
  { name: "Pommes sautées", description: "Pommes de terre coupées et sautées à la poêle avec oignons, herbes et épices maison", price: 19.99, category: "entrees", preparationTime: 15, rating: 4.4, reviewCount: 44, isAvailable: true, image: "https://images.unsplash.com/photo-1518013431117-eb1465fa5752?w=500" },
  { name: "Frites de patate douce (Wêli)", description: "Patates douces coupées en frites et frites à l'huile — sucrées et croustillantes", price: 19.99, category: "entrees", preparationTime: 15, rating: 4.6, reviewCount: 39, isAvailable: true, image: "https://images.unsplash.com/photo-1623428187969-5da2dcea5ebf?w=500" },
  { name: "Beignets de banane (Talé talé)", description: "Bananes plantains bien mûres trempées dans la pâte et frites — sucrées et dorées", price: 19.99, category: "desserts", preparationTime: 10, rating: 4.8, reviewCount: 91, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=500" },
  { name: "Frites pommes / Aloko (banane plantain frit)", description: "Frites de pommes de terre classiques ou aloko — banane plantain frit croustillant à l'extérieur, fondant à l'intérieur", price: 24.99, category: "entrees", preparationTime: 15, rating: 4.5, reviewCount: 57, isAvailable: true, image: "https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500" },

  // ── AUTRES ──
  { name: "Monyo (poisson)", description: "Préparation traditionnelle de poisson selon la recette Monyo — poisson mijoté en sauce aux épices locales", price: 69.99, category: "plats_principaux", preparationTime: 30, rating: 4.7, reviewCount: 28, isAvailable: true, image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500" },
  { name: "Dokôr / Gbofloto / Beignets sucrés", description: "Beignets moelleux traditionnels — Dokôr (beignets de maïs) ou Gbofloto (beignets soufflés sucrés)", price: 17.49, category: "desserts", preparationTime: 10, rating: 4.7, reviewCount: 73, isAvailable: true, image: "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=500" },
  { name: "Douzaine de fromage wagashi déjà frit", description: "12 pièces de fromage wagashi (fromage africain) déjà frits, croustillants à l'extérieur et fondants à l'intérieur", price: 44.99, category: "entrees", preparationTime: 5, rating: 4.8, reviewCount: 62, isAvailable: true, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a318?w=500" },
  { name: "1/4 Fromage wagashi", description: "Quart de fromage wagashi nature ou grillé selon votre préférence", price: 14.99, category: "entrees", preparationTime: 5, rating: 4.5, reviewCount: 41, isAvailable: true, image: "https://images.unsplash.com/photo-1486297678162-eb2a19b0a318?w=500" },

  // ── BOISSONS ──
  { name: "Yaourt 500cc / 1000cc", description: "Yaourt frais nature ou sucré, servi bien frais — grand choix de tailles", price: 19.99, category: "boissons", preparationTime: 2, rating: 4.6, reviewCount: 55, isAvailable: true, image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=500" },
  { name: "Dèguê / Thiakry (mil / couscous)", description: "Boisson épaisse sucrée à base de mil fermenté ou de couscous, mélangée à du yaourt — spécialité sénégalaise", price: 24.99, category: "boissons", preparationTime: 3, rating: 4.9, reviewCount: 84, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=500" },
  { name: "Bissap (jus de feuilles d'hibiscus)", description: "Jus naturel de fleurs d'hibiscus séchées, sucré et légèrement acidulé — 500cc ou 1000cc", price: 14.99, category: "boissons", preparationTime: 3, rating: 4.8, reviewCount: 107, featured: true, isAvailable: true, image: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=500" },
  { name: "Baobab au lait", description: "Boisson crémeuse à base de pulpe de fruit de baobab mélangée au lait — riche en vitamines", price: 22.49, category: "boissons", preparationTime: 3, rating: 4.7, reviewCount: 49, isAvailable: true, image: "https://images.unsplash.com/photo-1638176066666-ffb2f013c7dd?w=500" },
]

const seedAdmin = async () => {
  try {
    const email = (process.env.ADMIN_EMAIL || 'admin@wenam.ma').toLowerCase()
    const exists = await User.findOne({ email })
    if (!exists) {
      // Premier demarrage : mot de passe pris dans ADMIN_PASSWORD, sinon genere au hasard
      const password = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(9).toString('base64url')
      await User.create({
        name: 'Samuelle KAKPO',
        email,
        password,
        role: 'admin',
        phone: '+212 643 389 585',
        address: { street: 'Avenue Al Majd 2', city: 'Rabat' }
      })
      console.log(`Admin cree : ${email}${process.env.ADMIN_PASSWORD ? '' : ` (mot de passe provisoire : ${password}, a changer avec scripts/admin-password.js)`}`)
    }
  } catch (err) { console.error('Seed admin error:', err.message) }
}

const seedMenu = async () => {
  try {
    const count = await MenuItem.countDocuments()
    if (count === 0) {
      await MenuItem.insertMany(menuData)
      console.log(`✅ ${menuData.length} plats Wénam ajoutés`)
    } else {
      // Reseed option
      console.log(`ℹ️  ${count} plats déjà présents. Pour réinitialiser: node -e "require('./src/config/db');require('./src/models/MenuItem').deleteMany({}).then(()=>console.log('cleared'))"`)
    }
  } catch (err) { console.error('Seed menu error:', err.message) }
}

const reseedMenu = async () => {
  await MenuItem.deleteMany({})
  await MenuItem.insertMany(menuData)
  console.log(`✅ Menu réinitialisé: ${menuData.length} plats`)
}

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
  const connectDB = require('../config/db')
  const force = process.argv.includes('--force')
  connectDB().then(async () => {
    await seedAdmin()
    if (force) await reseedMenu()
    else await seedMenu()
    console.log('🌱 Seed terminé!')
    process.exit(0)
  })
}

module.exports = { seedAdmin, seedMenu }
