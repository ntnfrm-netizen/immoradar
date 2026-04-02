# Plan d'Intégration Gmail Réel - ImmoRadar

Ce plan détaille les étapes pour transformer le simulateur actuel en un véritable lecteur d'emails synchronisé avec le compte Google Pro de Marie-Astrid.

## User Review Required

> [!IMPORTANT]
> **Configuration Google Cloud** : Cette étape nécessite une intervention de votre part (ou de Marie-Astrid) pour créer des identifiants sécurisés sur la console Google Cloud. Je ne peux pas le faire à votre place car cela nécessite un compte Google.
> 
> **Validation du périmètre** : L'application demandera les droits "Lecture seule" (`gmail.readonly`) sur les emails. Cela permettra de lister les messages et de lire leur contenu sans pouvoir en envoyer ou en supprimer.

## Proposed Changes

### 1. Préparation Google Cloud (Action Utilisateur)
- Création d'un projet "ImmoRadar".
- Activation de l'API Gmail.
- Configuration de l'écran de consentement OAuth.
- Création d'un **ID Client OAuth 2.0** (Type : Application Web) avec l'URL de votre site (Vercel/Netlify) en "Origine JavaScript autorisée".

### 2. Intégration des Bibliothèques Google

#### [MODIFY] [index.html](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/index.html)
- Ajout des scripts `https://accounts.google.com/gsi/client` (Identity) et `https://apis.google.com/js/api.js` (GAPI).
- Ajout d'un bouton "Connexion Google" dans l'en-tête pour le premier accès.

### 3. Logique d'Authentification et de Récupération

#### [MODIFY] [app.js](file:///Users/antoinefermey/.gemini/antigravity/brain/82c8d6a5-fff7-4b01-af64-e39514e9fa3f/app.js)
- **Init GIS & GAPI** : Fonctions d'initialisation au chargement de l'appli.
- **Gestion du Token** : Demande d'accès et stockage temporaire du token.
- **Fetch Gmail** : 
    - Recherche des emails avec la requête `from:noreply@seloger.com after:7d`.
    - Récupération du snippet ou du corps HTML de chaque mail.
- **Parseur HTML Réel** : Utilisation de DOMParser pour extraire précisément les données des tableaux SeLoger (Prix, m², Ville, Photo, URL).

### 4. Synchronisation Temps Réel
- **Auto-Refresh** : L'application lancera une synchronisation automatique au démarrage pour récupérer les dernières alertes.
- **Historique Initial** : Lors de la première connexion, l'appli remontera les **7 derniers jours** d'emails.
- Sauvegarde en base locale pour éviter de re-parser les mêmes emails à chaque fois (déduplication par ID de message).

## User Actions Required

> [!IMPORTANT]
> **Identifiants Google Cloud** : Pour avancer, vous devez me fournir :
> 1. Votre **ID Client OAuth** (ex: `xxx.apps.googleusercontent.com`)
> 2. Votre **Clé API** Google (pour les services GAPI)
> 
> *Si vous ne savez pas comment les obtenir, dites-le moi, je vous donnerai la marche à suivre pas à pas.*

## Verification Plan

### Manual Verification
1. Cliquer sur "Connexion Google" et valider les droits.
2. Vérifier que la liste "Alertes" se peuple avec de vrais emails SeLoger.
3. Vérifier que le filtrage sur les 7 villes (Sceaux, etc.) s'applique toujours sur les données réelles.
4. Tester le bouton de déconnexion.
