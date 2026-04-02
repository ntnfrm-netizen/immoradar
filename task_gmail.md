# Tâches - Intégration Gmail

- `[ ]` **Initialisation & Auth**
    - `[ ]` Ajout des scripts Google (GIS & GAPI) dans `index.html`
    - `[ ]` Bouton de connexion/déconnexion Google
    - `[ ]` Logique d'initialisation du `tokenClient` dans `app.js`
- `[ ]` **Récupération des Données**
    - `[ ]` Fonction de recherche d'emails (`noreply@seloger.com`)
    - `[ ]` Récupération du contenu HTML des messages
- `[ ]` **Parseur d'Emails**
    - `[ ]` Algorithme d'extraction (Prix, m², Ville, URL, Image)
    - `[ ]` Déduplication des annonces (stockage LocalStorage)
- `[ ]` **Synchronisation Temps Réel**
    - `[ ]` Auto-refresh au chargement de l'appli
    - `[ ]` Chargement de l'historique (7 jours) lors de la 1ère connexion
- `[ ]` **Finalisation & Tests**
    - `[ ]` Gestion des erreurs d'expiration de token
    - `[ ]` Nettoyage du simulateur précédent
