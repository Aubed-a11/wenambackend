# MIAWÉZON : mise en place

Rubrique événement + billetterie (phases 1 et 2) ajoutée au front `wenamnew` et au backend `wenambackend`.

## 1. Installer

Backend :

```
cd wenambackend
npm install
```

(nouvelles dépendances : `qrcode`, `pdfkit`)

Front :

```
cd wenamnew
npm install
```

(nouvelle dépendance : `html5-qrcode` pour le scanner du jour J)

## 2. Variables d'environnement du backend (YouCan Pay)

Ajouter dans le `.env` du serveur (voir `.env.example`) :

```
YCP_PRIVATE_KEY=pri_...
YCP_PUBLIC_KEY=pub_...
YCP_SANDBOX=true
FRONTEND_URL=https://www.wenamfood.com
```

Les clés se trouvent dans le tableau de bord YouCan Pay, rubrique Paramètres puis Clés API. Passer `YCP_SANDBOX=false` (avec les clés de production) pour l'ouverture réelle de la billetterie.

Dans YouCan Pay, déclarer le webhook `https://api.wenamfood.com/api/miawezon/webhook/youcanpay`. Il confirme le paiement même si le client ferme la page avant de revenir sur le site. La signature est vérifiée avec la clé privée.

Déroulé : le client choisit ses billets, puis il est redirigé vers la page sécurisée YouCan Pay (carte bancaire Visa, Mastercard, CMI ou CashPlus) et revient ensuite sur le site. Le serveur revérifie la transaction (montant en DH, commande) auprès de YouCan Pay avant d'émettre les billets.

Pour tester en local sans YouCan Pay : `YCP_MOCK=true` (refusé automatiquement si `NODE_ENV=production`).

## 2 bis. Courriels des billets (contact@wenamfood.com)

Les billets partent de `contact@wenamfood.com`, sous le nom « MIAWÉZON », avec un message de bienvenue, le logo MIAWÉZON et les billets en PDF. Ajouter dans le `.env` du serveur les accès SMTP de cette boîte :

```
MIAWEZON_SMTP_HOST=smtp.hostinger.com
MIAWEZON_SMTP_PORT=465
MIAWEZON_SMTP_SECURE=true
MIAWEZON_SMTP_USER=contact@wenamfood.com
MIAWEZON_SMTP_PASS=mot-de-passe-de-la-boite
```

(valeurs à adapter à l'hébergeur de la boîte mail). Sans ces lignes, le SMTP principal (`SMTP_*`) est utilisé et doit être autorisé à envoyer au nom de contact@wenamfood.com.

Logo : le logo MIAWÉZON (extrait des modèles de billets) est dans `public/images/miawezon/logo-dark.png`, `logo-light.png` et `logo-gold.png` (front) et `src/assets/miawezon-logo-*.png` (backend). Il remplace le logo Wênam dans toute la rubrique.

## 3. Mise en ligne

Au premier démarrage, le serveur crée la configuration MIAWÉZON avec :

- rubrique **masquée** du public (seuls les admins la voient, avec un bandeau « Aperçu »)
- ouverture de la billetterie le 1er avril 2027 à 00h00
- ZINLI 350 DH, 50 places ; AGBADJA 500 DH, 20 places (à régler dans l'admin)

Tout se règle dans **Admin > MIAWÉZON > Réglages** :

- le 29 janvier 2027 : cocher « Rubrique visible sur le site » (phase 1)
- quand la cliente transmet les infos : date, heure, lieu (FR et EN)
- au 26 février 2027 : prix, nombre de places, libellés
- au 8 janvier 2027 : cocher « Menu du buffet définitif »

La billetterie s'ouvre toute seule à la date prévue (mode « Automatique »). On peut aussi la forcer ouverte ou fermée.

## 4. Contenus et images

Textes, menus ZINLI et AGBADJA (cartes sans photos, un plat marqué `only: 'AGBADJA'` n'apparaît que dans ce menu), prestations des billets, galerie : `src/data/miawezon.js` (front).

Images provisoires dans `public/images/miawezon/`, à remplacer en gardant les mêmes noms :

- `logo.png` (logo MIAWÉZON, PNG transparent)
- `hero.jpg` (fond de la page événement, format large)
- `banniere-accueil.jpg` (bannière de la page d'accueil)
- `concept.jpg`, `galerie-1.jpg` à `galerie-5.jpg`

Billets : les modèles fournis sont dans `public/images/miawezon/ticket-zinli.jpg` et `ticket-agbadja.jpg` (front) et `src/assets/tickets/` (backend). Le système y écrit le prix, la date, le lieu, le n° de billet, le nom, le QR code, le logo Wênam et le n° d'achat. Les positions sont dans `layout.json` (backend) et `src/data/ticketLayout.json` (front), à garder identiques.

Vidéo de présentation optionnelle : renseigner `conceptVideo` dans `src/data/miawezon.js`.

## 5. Pages

Public :

- `/` : bannière MIAWÉZON sous le hero, lien « MIAWÉZON Nouveau » dans le menu, sélecteur FR | EN
- `/miawezon` : page événement (concept, galerie, infos, billetterie, compte à rebours, « Me prévenir »)
- `/miawezon/menu` : menu du buffet
- `/miawezon/reserver` : tunnel en 4 étapes (catégorie, participant, paiement YouCan Pay, confirmation)
- `/miawezon/billets/:id` : billets avec QR code, PDF, partage WhatsApp

Admin :

- `/admin/miawezon` : tableau de bord des ventes, commandes (renvoi e-mail, WhatsApp, vérification manuelle d'un paiement, annulation), réglages, liste d'attente (export CSV, envoi d'un e-mail d'ouverture)
- `/admin/miawezon/controle` : scanner QR du jour J (caméra du téléphone) avec saisie manuelle et compteur d'entrées

## 6. Fonctionnement de la billetterie

- les places sont bloquées 20 minutes pendant le paiement, puis remises en vente si le client ne paie pas
- le paiement est revérifié côté serveur auprès de YouCan Pay (montant et statut) avant d'émettre les billets
- un billet = un QR code unique, nominatif, valable pour une seule entrée (le second scan affiche « Déjà utilisé »)
- le client reçoit un e-mail avec les billets en PDF (au format des modèles) et un lien privé vers ses billets

À savoir : l'annulation d'une commande payée ne rembourse pas automatiquement, le remboursement se fait depuis le tableau de bord YouCan Pay.
