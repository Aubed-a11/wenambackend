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

## 2. Variables d'environnement du backend

Ajouter dans le `.env` du serveur (voir `.env.example`) :

```
KKIAPAY_PUBLIC_KEY=...
KKIAPAY_PRIVATE_KEY=...
KKIAPAY_SECRET=...
KKIAPAY_SANDBOX=true
KKIAPAY_WEBHOOK_SECRET=un-secret-au-choix
FRONTEND_URL=https://www.wenamfood.com
```

Passer `KKIAPAY_SANDBOX=false` le jour de l'ouverture réelle (1er avril 2027).

Dans le tableau de bord KKiaPay, configurer le webhook :
URL `https://api.wenamfood.com/api/miawezon/webhook/kkiapay`, même secret que `KKIAPAY_WEBHOOK_SECRET`.
Il sert de filet de sécurité si un client paie puis ferme la page avant la confirmation.

Pour tester en local sans KKiaPay : `KKIAPAY_MOCK=true` (refusé automatiquement si `NODE_ENV=production`).
Le bouton de paiement devient « Simuler le paiement (test) ».

Les e-mails de billets utilisent le SMTP déjà configuré (`SMTP_*`, `FROM_EMAIL`).

## 3. Mise en ligne

Au premier démarrage, le serveur crée la configuration MIAWÉZON avec :

- rubrique **masquée** du public (seuls les admins la voient, avec un bandeau « Aperçu »)
- ouverture de la billetterie le 1er avril 2027 à 00h00
- ZINLI 250 MAD, 50 places ; AGBADJA 550 MAD, 20 places (valeurs d'exemple, à régler dans l'admin)

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

Remplacer aussi `src/assets/miawezon-logo.png` côté backend (logo imprimé sur les billets PDF).

Vidéo de présentation optionnelle : renseigner `conceptVideo` dans `src/data/miawezon.js`.

## 5. Pages

Public :

- `/` : bannière MIAWÉZON sous le hero, lien « MIAWÉZON Nouveau » dans le menu, sélecteur FR | EN
- `/miawezon` : page événement (concept, galerie, infos, billetterie, compte à rebours, « Me prévenir »)
- `/miawezon/menu` : menu du buffet
- `/miawezon/reserver` : tunnel en 4 étapes (catégorie, participant, paiement KKiaPay, confirmation)
- `/miawezon/billets/:id` : billets avec QR code, PDF, partage WhatsApp

Admin :

- `/admin/miawezon` : tableau de bord des ventes, commandes (renvoi e-mail, WhatsApp, vérification manuelle d'un paiement, annulation), réglages, liste d'attente (export CSV, envoi d'un e-mail d'ouverture)
- `/admin/miawezon/controle` : scanner QR du jour J (caméra du téléphone) avec saisie manuelle et compteur d'entrées

## 6. Fonctionnement de la billetterie

- les places sont bloquées 20 minutes pendant le paiement, puis remises en vente si le client ne paie pas
- le paiement est revérifié côté serveur auprès de KKiaPay (montant et statut) avant d'émettre les billets
- un billet = un QR code unique, nominatif, valable pour une seule entrée (le second scan affiche « Déjà utilisé »)
- le client reçoit un e-mail avec les billets en PDF et un lien privé vers ses billets

À savoir : l'annulation d'une commande payée ne rembourse pas automatiquement, le remboursement se fait depuis le tableau de bord KKiaPay.
