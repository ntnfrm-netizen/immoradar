# Walkthrough - ImmoRadar v1.0

L'application **ImmoRadar** est maintenant prête pour Marie-Astrid. Elle a été conçue comme une **PWA (Progressive Web App)** premium, optimisée spécifiquement pour une utilisation fluide sur iPhone.

## Fonctionnalités Clés

### 🚨 Gestion des Alertes (Gmail & SeLoger)
- **Filtrage Intelligent** : L'application ne retient que les biens situés à Sceaux, Bourg-la-Reine, Antony, Châtenay-Malabry, Le Plessis-Robinson, Fontenay-aux-Roses et Clamart.
- **Import Manuel d'Emails** : Marie-Astrid peut cliquer sur l'icône ✉️ dans l'en-tête pour coller le contenu d'un mail SeLoger. L'IA intégrée (`app.js`) extraira automatiquement le prix, la surface et la ville pour créer une fiche instantanément.

### 🚗 Tournée de Visite Optimisée
- **Filtre Temporel** : Sélection des biens parus au cours des 7 derniers jours, des 2 dernières semaines ou du mois.
- **Itinéraire Google Maps** : En cliquant sur "Lancer la Tournée", l'application génère un itinéraire multi-étapes directement dans Google Maps pour optimiser ses déplacements.

### ➕ Ajout Manuel & Favoris
- **Bouton ➕** : Un bouton central permet d'ajouter des biens "Off-market" ou repérés sur le terrain.
- **Favoris ❤️** : Une section dédiée pour garder un œil sur les biens les plus prometteurs.

## Design & Expérience Utilisateur

> [!NOTE]
> **Design "Haute Couture"** : J'ai utilisé une palette **Bleu Marine Profond et Or Champagne** pour refléter le positionnement haut de gamme de l'immobilier dans le 92 Sud.
> **Composants iOS** : Les barres de navigation, les flous (backdrop-filter) et les espacements respectent les standards de l'iPhone (encoche et barre home incluses).

## Installation sur l'iPhone de Marie-Astrid

Pour que Marie-Astrid puisse l'utiliser comme une application native :
1. Ouvrir l'URL de l'application dans **Safari**.
2. Appuyer sur l'icône **Partager** (le carré avec une flèche vers le haut).
3. Faire défiler et choisir **"Sur l'écran d'accueil"**.
4. L'icône ImmoRadar apparaîtra sur son iPhone et l'application s'ouvrira en plein écran, sans la barre d'adresse du navigateur.

## Fichiers Principaux

- [index.html](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/index.html) : Structure de l'application.
- [index.css](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/index.css) : Design System Premium.
- [app.js](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/app.js) : Intelligence de filtrage et parsing.
- [manifest.json](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/manifest.json) : Configuration PWA.
