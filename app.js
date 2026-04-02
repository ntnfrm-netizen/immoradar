/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 */

const app = {
    // Configuration Google
    config: {
        CLIENT_ID: '76085489153-uflsgdc6t9u09uvr43rgaj2c74m2tg60.apps.googleusercontent.com',
        API_KEY: 'AIzaSyBQ-ACsyDEYCzRnrFb_AYhTzUi4SpSczHo', 
        DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest"],
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly'
    },

    // Current state
    state: {
        activeView: 'alerts',
        listings: JSON.parse(localStorage.getItem('immo_cache') || '[]'),
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        manualAdditions: JSON.parse(localStorage.getItem('immo_manual') || '[]'),
        targetCities: [
            'Sceaux', 'Bourg-la-Reine', 'Antony', 
            'Châtenay-Malabry', 'Le Plessis-Robinson', 
            'Fontenay-aux-Roses', 'Clamart'
        ],
        tourDaysFilter: 7,
        tokenResponse: null,
        gapiLoaded: false
    },

    async init() {
        this.logToUI('Démarrage ImmoRadar v1.3...');
        this.bindEvents();
        this.loadLocalData();
        this.checkAuthResponseInUrl();
        this.initGoogleAuth();
        this.render();
    },

    logToUI(msg) {
        console.log(msg);
        const logEl = document.getElementById('debug-log');
        if (logEl) {
            logEl.innerHTML += `> ${msg}<br>`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    },

    bindEvents() {
        const addForm = document.getElementById('add-form');
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleManualAdd();
            });
        }
    },

    // --- Google Auth ---
    initGoogleAuth() {
        this.logToUI('Initialisation GAPI/GIS...');
        // Init GAPI
        window.gapiInit = () => {
            this.logToUI('Chargement Client GAPI...');
            gapi.load('client', async () => {
                try {
                    await gapi.client.init({
                        apiKey: this.config.API_KEY,
                        discoveryDocs: this.config.DISCOVERY_DOCS,
                    });
                    this.state.gapiLoaded = true;
                    this.logToUI('GAPI Prêt !');
                    this.checkExistingToken();
                } catch (e) {
                    this.logToUI(`Erreur GAPI Init: ${e.message || e}`);
                }
            });
        };

        // Trigger loading if scripts already loaded
        if (typeof gapi !== 'undefined') window.gapiInit();
        else this.logToUI('Attente script GAPI...');
    },

    handleAuthClick() {
        this.logToUI('Tentative de connexion...');
        // Utilisation du mode REDIRECT pour éviter les problèmes de cookies/popups sur iOS
        const rootUrl = window.location.origin + window.location.pathname;
        const oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.config.CLIENT_ID}&` +
            `redirect_uri=${encodeURIComponent(rootUrl)}&` +
            `response_type=token&` +
            `scope=${encodeURIComponent(this.config.SCOPES)}&` +
            `prompt=consent`;
            
        window.location.href = oauthUrl;
    },

    checkAuthResponseInUrl() {
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        
        if (accessToken) {
            this.logToUI('Token détecté dans l\'URL !');
            const resp = {
                access_token: accessToken,
                expires_in: params.get('expires_in')
            };
            this.handleAuthResponse(resp);
            // Nettoyage de l'URL pour ne pas garder le token visible
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },

    handleLogoutClick() {
        if (this.state.tokenResponse) {
            this.logToUI('Déconnexion...');
            // Tentative de revoke si possible, sinon simple déconnexion locale
            try {
                fetch(`https://oauth2.googleapis.com/revoke?token=${this.state.tokenResponse.access_token}`, { method: 'POST', mode: 'no-cors' });
            } catch(e) {}
            
            this.state.tokenResponse = null;
            localStorage.removeItem('immo_token');
            document.getElementById('login-button').classList.remove('hidden');
            document.getElementById('logout-button').classList.add('hidden');
            this.logToUI('Déconnecté.');
            this.logToUI("Déconnexion réussie.");
        }
    },

    handleAuthResponse(resp) {
        this.state.tokenResponse = resp;
        localStorage.setItem('immo_token', JSON.stringify(resp));
        this.logToUI('Session enregistrée.');
        
        document.getElementById('login-button').classList.add('hidden');
        document.getElementById('logout-button').classList.remove('hidden');
        
        // On attend que GAPI soit prêt avant de rafraîchir
        const checkGapi = setInterval(() => {
            if (this.state.gapiLoaded) {
                clearInterval(checkGapi);
                this.refreshData();
            }
        }, 100);
    },

    checkExistingToken() {
        const saved = localStorage.getItem('immo_token');
        if (saved) {
            this.logToUI('Session existante trouvée.');
            this.state.tokenResponse = JSON.parse(saved);
            document.getElementById('login-button').classList.add('hidden');
            document.getElementById('logout-button').classList.remove('hidden');
            
            // Rafraîchissement automatique au démarrage
            if (this.state.gapiLoaded) {
                this.refreshData();
            }
        }
    },

    // --- Data Management ---
    loadLocalData() {
        this.state.listings = [...(JSON.parse(localStorage.getItem('immo_cache') || '[]')), ...this.state.manualAdditions];
    },

    async refreshData() {
        if (!this.state.tokenResponse) return;
        this.logToUI('Lancement synchronisation...');

        // Attente si GAPI n'est pas encore prêt (max 5s)
        let gapiWait = 0;
        while (!this.state.gapiLoaded && gapiWait < 50) {
            await new Promise(r => setTimeout(r, 100));
            gapiWait++;
        }

        if (!this.state.gapiLoaded) {
            this.logToUI('GAPI toujours en attente...');
            return;
        }

        const btn = document.querySelector('[onclick="app.refreshData()"] i');
        if (btn) btn.classList.add('animate-spin');

        try {
            // Configuration manuelle du token
            gapi.client.setToken({ access_token: this.state.tokenResponse.access_token });

            if (!gapi.client.gmail) {
                this.logToUI('Échec : Client Gmail non trouvé.');
                return;
            }

            this.logToUI('Recherche mails Gmail...');
            // Recherche plus large pour ne rien rater (SeLoger utilise plusieurs adresses)
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'from:seloger.com after:7d'
            });

            const messages = response.result.messages || [];
            this.logToUI(`${messages.length} mails trouvés.`);
            
            if (messages.length === 0) {
                this.logToUI("Aucun mail SeLoger ces 7 derniers jours.");
                // On vide le chargement
                const container = document.getElementById('alerts-list');
                if (container) container.innerHTML = '<div class="empty-state"><p>Aucun mail SeLoger récent trouvé.</p></div>';
            } else {
                await this.processMessages(messages);
            }
        } catch (err) {
            this.logToUI(`Erreur Gmail API: ${err.status || err}`);
            if (err.status === 401) {
                this.logToUI("Session expirée, reconnexion...");
                this.handleAuthClick();
            }
        } finally {
            if (btn) btn.classList.remove('animate-spin');
            try {
                this.render();
                this.logToUI('Mise à jour affichage terminée.');
            } catch(e) {
                this.logToUI('Erreur lors du rendu final.');
            }
        }
    },

    async processMessages(messages) {
        this.logToUI(`Analyse de ${messages.length} messages...`);
        const newListings = [];
        const existingIds = new Set(this.state.listings.map(l => l.id));

        // Limitation à 10 messages pour éviter de saturer le mobile lors du premier fetch
        const itemsToProcess = messages.slice(0, 10);

        for (const msg of itemsToProcess) {
            // On re-scanne si l'annonce n'existe pas ou si elle a un prix nul (erreur de parsing précédente)
            const existing = this.state.listings.find(l => l.id === msg.id);
            if (existing && existing.price > 0 && existing.source.includes('Gmail')) continue;

            try {
                const detail = await gapi.client.gmail.users.messages.get({
                    'userId': 'me',
                    'id': msg.id,
                    'format': 'full'
                });

                const parsed = this.parseGmailMessage(detail.result, msg.id);
                // Le filtre est déjà fait dans parseGmailMessage, on est plus large ici
                if (parsed) {
                    newListings.push(parsed);
                }
            } catch (err) {
                this.logToUI(`Erreur lecture ${msg.id}`);
                continue;
            }
        }

        if (newListings.length > 0) {
            this.logToUI(`${newListings.length} nouveaux biens trouvés !`);
            this.state.listings = [...newListings, ...this.state.listings];
            try {
                const toCache = this.state.listings.filter(l => l && l.source && l.source.includes('SeLoger'));
                localStorage.setItem('immo_cache', JSON.stringify(toCache));
            } catch(e) {
                this.logToUI('Erreur sauvegarde cache');
            }
        }
    },

    parseGmailMessage(msg, id) {
        const snippet = msg.snippet || "";
        const body = this.getBody(msg.payload);
        const date = new Date(parseInt(msg.internalDate)).toISOString();

        // Nettoyage Unicode pour les prix/surfaces (espaces insécables, etc.)
        const cleanBody = body.replace(/[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g, ' ');

        // Regex ultra-précises basées sur le format réel
        const priceRegex = /([0-9\s ]+)(?:€|EUR)/i;
        const surfaceRegex = /([0-9\s ,.]+)\s*(?:m²|m2)/i;
        const roomsRegex = /(\d+)\s*pièce/i;
        
        const priceMatch = cleanBody.match(priceRegex) || snippet.match(priceRegex);
        const surfaceMatch = cleanBody.match(surfaceRegex) || snippet.match(surfaceRegex);
        const roomsMatch = cleanBody.match(roomsRegex) || snippet.match(roomsRegex);
        
        // Extraction de l'URL réelle SeLoger
        const urlMatch = cleanBody.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const realUrl = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        let foundCity = "Sceaux"; // Par défaut si on est dans le secteur
        let neighborhood = "";
        
        // Tentative de détection plus précise de la ville et du quartier
        for (let city of this.state.targetCities) {
            if (cleanBody.toLowerCase().includes(city.toLowerCase()) || snippet.toLowerCase().includes(city.toLowerCase())) {
                foundCity = city;
                // Extraction du quartier si présent avant la ville (format: Quartier, Ville)
                const neighborhoodMatch = cleanBody.match(new RegExp(`([^,.\n]+),\\s*${city}`, 'i'));
                if (neighborhoodMatch) neighborhood = neighborhoodMatch[1].trim();
                break;
            }
        }

        const price = priceMatch ? parseInt(priceMatch[1].replace(/[\s ]/g, '')) : 0;
        const surface = surfaceMatch ? parseFloat(surfaceMatch[1].replace(/[\s ]/g, '').replace(',', '.')) : 0;
        const rooms = roomsMatch ? roomsMatch[1] : '?';

        return {
            id: id,
            source: 'SeLoger (Gmail)',
            city: neighborhood ? `${foundCity} (${neighborhood})` : foundCity,
            price: price || 0,
            surface: surface || 0,
            rooms: rooms,
            url: realUrl,
            date: date,
            img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80'
        };
    },

    getBody(payload) {
        let body = "";
        if (payload.body.data) {
            body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (payload.parts) {
            payload.parts.forEach(part => {
                body += this.getBody(part);
            });
        }
        return body;
    },

    handleManualAdd(event) {
        if (event) event.preventDefault();
        const city = document.getElementById('add-city').value;
        const price = document.getElementById('add-price').value;
        const surface = document.getElementById('add-surface').value;
        const url = document.getElementById('add-url').value;

        if (!city || !price || !surface) {
            this.logToUI("Erreur : Champs obligatoires manquants.");
            return;
        }

        const newEntry = {
            id: 'manual-' + Date.now(),
            source: 'Manuel',
            city,
            price: parseInt(price),
            surface: parseInt(surface),
            rooms: '?',
            url: url || '#',
            date: new Date().toISOString(),
            img: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80'
        };

        this.state.manualAdditions.unshift(newEntry);
        localStorage.setItem('immo_manual', JSON.stringify(this.state.manualAdditions));
        this.state.listings.unshift(newEntry);
        
        this.closeModal('add-modal');
        document.getElementById('add-form').reset();
        this.render();
    },

    parseEmail() {
        const content = document.getElementById('email-content').value;
        if (!content) return;

        const priceMatch = content.match(/([0-9\s]+)[€|EUR]/i);
        const surfaceMatch = content.match(/([0-9\s,]+)[m²|m2]/i);
        
        let foundCity = "Sceaux";
        for(let city of this.state.targetCities) {
            if (content.toLowerCase().includes(city.toLowerCase())) {
                foundCity = city;
                break;
            }
        }

        const price = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : 500000;
        const surface = surfaceMatch ? parseInt(surfaceMatch[1].replace(/\s/g, '').replace(',', '.')) : 50;

        const newEntry = {
            id: 'email-' + Date.now(),
            source: 'SeLoger (Auto)',
            city: foundCity,
            price: price,
            surface: surface,
            rooms: '?',
            url: 'https://www.seloger.com',
            date: new Date().toISOString(),
            img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80'
        };

        this.state.listings.unshift(newEntry);
        this.closeModal('import-modal');
        document.getElementById('email-content').value = '';
        this.render();
        this.logToUI(`Annonce détectée !`);
    },

    toggleFavorite(id) {
        const index = this.state.favorites.indexOf(id);
        if (index > -1) {
            this.state.favorites.splice(index, 1);
        } else {
            this.state.favorites.push(id);
        }
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick').includes(viewId)) {
                item.classList.add('active');
            }
        });

        const titles = {
            'alerts': 'IMMORADAR',
            'map': 'Carte',
            'tour': 'Tournée',
            'favorites': 'Favoris'
        };
        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            titleEl.innerHTML = `${titles[viewId] || 'IMMORADAR'} <span style="font-size: 0.6rem; opacity: 0.5;">v1.3</span>`;
        }
        
        this.state.activeView = viewId;
        this.render();
    },

    openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    },

    render() {
        if (this.state.activeView === 'alerts') this.renderAlerts();
        if (this.state.activeView === 'favorites') this.renderFavorites();
        if (this.state.activeView === 'tour') this.renderTour();
        if (window.lucide) lucide.createIcons();
    },

    renderAlerts() {
        const container = document.getElementById('alerts-list');
        if (!container) return;
        container.innerHTML = this.state.listings.map(item => this.createCardHTML(item)).join('');
    },

    renderFavorites() {
        const container = document.getElementById('favorites-list');
        if (!container) return;
        const favs = this.state.listings.filter(l => this.state.favorites.includes(l.id));
        if (favs.length === 0) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="heart" size="48"></i><p>Aucun favori.</p></div>`;
        } else {
            container.innerHTML = favs.map(item => this.createCardHTML(item)).join('');
        }
    },

    renderTour() {
        const container = document.getElementById('tour-list');
        if (!container) return;
        const threshold = Date.now() - (this.state.tourDaysFilter * 86400000);
        const tourItems = this.state.listings.filter(l => new Date(l.date).getTime() > threshold);
        if (tourItems.length === 0) {
            container.innerHTML = `<p class="empty-state">Aucun bien récent trouvé.</p>`;
        } else {
            container.innerHTML = tourItems.map((item, i) => `
                <div class="tour-stop">
                    <div class="stop-number">${i + 1}</div>
                    <div class="stop-info">
                        <h3>${item.city} - ${item.surface}m²</h3>
                        <p>${item.price.toLocaleString()}€</p>
                    </div>
                </div>
            `).join('');
        }
    },

    setTourFilter(days) {
        this.state.tourDaysFilter = days;
        document.querySelectorAll('.tour-config .chip').forEach(c => {
            c.classList.remove('active');
            if (c.textContent.includes(days === 7 ? '7 jours' : days === 14 ? '2 semaines' : '1 mois')) {
                c.classList.add('active');
            }
        });
        this.renderTour();
    },

    generateRoute() {
        const threshold = Date.now() - (this.state.tourDaysFilter * 86400000);
        const tourItems = this.state.listings.filter(l => new Date(l.date).getTime() > threshold);
        if (tourItems.length === 0) {
            this.logToUI("Erreur : Aucun bien à visiter.");
            return;
        }
        const base = "https://www.google.com/maps/dir/";
        const stops = tourItems.map(item => encodeURIComponent(`${item.city}, France`)).join('/');
        window.open(base + stops, '_blank');
    },

    createCardHTML(item) {
        const isFav = this.state.favorites.includes(item.id);
        const dateStr = new Date(item.date).toLocaleDateString();
        return `
            <div class="card">
                <div class="card-img-container">
                    <img src="${item.img}" class="card-img" alt="Property">
                    <span class="card-badge">${item.city}</span>
                </div>
                <div class="card-content">
                    <div class="card-price">${(item.price || 0).toLocaleString()} €</div>
                    <div class="card-info">
                        <span>${item.surface} m² | ${item.rooms} pièces</span>
                        <span>${dateStr}</span>
                    </div>
                    <div class="card-actions">
                        <a href="${item.url}" target="_blank" class="primary-btn" style="flex:1; text-decoration:none; justify-content:center;">
                            Voir l'annonce
                        </a>
                        <button class="secondary-btn" onclick="app.toggleFavorite('${item.id}')">
                            <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : 'inherit'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};

window.onload = function() {};
document.addEventListener('DOMContentLoaded', () => app.init());
