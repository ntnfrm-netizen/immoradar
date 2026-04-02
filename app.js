/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 * Version 1.7.3 - Final Price Parsing & Filtering
 */

const app = {
    config: {
        CLIENT_ID: '76085489153-uflsgdc6t9u09uvr43rgaj2c74m2tg60.apps.googleusercontent.com',
        API_KEY: 'AIzaSyBQ-ACsyDEYCzRnrFb_AYhTzUi4SpSczHo', 
        DISCOVERY_DOCS: ["https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest"],
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly'
    },

    state: {
        activeView: 'alerts',
        listings: JSON.parse(localStorage.getItem('immo_cache') || '[]'),
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        manualAdditions: JSON.parse(localStorage.getItem('immo_manual') || '[]'),
        targetCities: ['Sceaux', 'Bourg-la-Reine', 'Antony', 'Châtenay-Malabry', 'Le Plessis-Robinson', 'Fontenay-aux-Roses', 'Clamart'],
        tourDaysFilter: 7,
        tokenResponse: null,
        gapiLoaded: false
    },

    async init() {
        this.logToUI('Démarrage ImmoRadar v1.7.3...');
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
            const messages = logEl.innerHTML.split('<br>').slice(-10);
            logEl.innerHTML = messages.join('<br>') + `> ${msg}<br>`;
            logEl.scrollTop = logEl.scrollHeight;
        }
    },

    bindEvents() {
        const addForm = document.getElementById('add-form');
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleManualAdd(e);
            });
        }
    },

    initGoogleAuth() {
        this.logToUI('Vérification GAPI...');
        let attempts = 0;
        const checkGapi = setInterval(() => {
            attempts++;
            if (typeof gapi !== 'undefined') {
                clearInterval(checkGapi);
                this.logToUI('GAPI Prêt !');
                this.loadGapiClient();
            } else if (attempts > 20) {
                clearInterval(checkGapi);
                this.logToUI('Erreur GAPI : Script non chargé.');
            }
        }, 500);

        window.gapiInit = () => {
            if (!this.state.gapiLoaded) this.loadGapiClient();
        };
    },

    loadGapiClient() {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    apiKey: this.config.API_KEY,
                    discoveryDocs: this.config.DISCOVERY_DOCS,
                });
                this.state.gapiLoaded = true;
                this.checkExistingToken();
            } catch (e) {
                this.logToUI(`Erreur GAPI Init: ${e.message}`);
            }
        });
    },

    handleAuthClick() {
        const rootUrl = window.location.origin + window.location.pathname;
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.config.CLIENT_ID}&redirect_uri=${encodeURIComponent(rootUrl)}&` +
            `response_type=token&scope=${encodeURIComponent(this.config.SCOPES)}&prompt=consent`;
    },

    checkAuthResponseInUrl() {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            this.handleAuthResponse({ access_token: token, expires_in: params.get('expires_in') });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },

    handleAuthResponse(resp) {
        this.state.tokenResponse = resp;
        localStorage.setItem('immo_token', JSON.stringify(resp));
        document.getElementById('login-button').classList.add('hidden');
        document.getElementById('logout-button').classList.remove('hidden');
        this.refreshData();
    },

    checkExistingToken() {
        const saved = localStorage.getItem('immo_token');
        if (saved) {
            this.state.tokenResponse = JSON.parse(saved);
            document.getElementById('login-button').classList.add('hidden');
            document.getElementById('logout-button').classList.remove('hidden');
            this.refreshData();
        }
    },

    loadLocalData() {
        const cached = JSON.parse(localStorage.getItem('immo_cache') || '[]');
        const manual = JSON.parse(localStorage.getItem('immo_manual') || '[]');
        this.state.listings = [...cached, ...manual];
    },

    async refreshData() {
        if (!this.state.tokenResponse || !this.state.gapiLoaded) return;
        this.logToUI('Sync en cours...');
        const btn = document.querySelector('[onclick="app.refreshData()"] i');
        if (btn) btn.classList.add('animate-spin');

        try {
            gapi.client.setToken({ access_token: this.state.tokenResponse.access_token });
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'from:seloger.com after:7d'
            });

            const messages = response.result.messages || [];
            if (messages.length > 0) {
                await this.processMessages(messages);
            } else {
                this.logToUI("Aucun mail trouvé.");
            }
        } catch (err) {
            if (err.status === 401) this.handleAuthClick();
        } finally {
            if (btn) btn.classList.remove('animate-spin');
            this.render();
        }
    },

    async processMessages(messages) {
        const newListings = [];
        const items = messages.slice(0, 15);

        for (const msg of items) {
            const existing = this.state.listings.find(l => l.id === msg.id);
            if (existing) continue;

            try {
                const detail = await gapi.client.gmail.users.messages.get({
                    'userId': 'me',
                    'id': msg.id,
                    'format': 'full'
                });
                const parsed = this.parseGmailMessage(detail.result, msg.id);
                
                if (parsed && parsed.price > 50000) {
                    newListings.push(parsed);
                }
            } catch (e) {
                console.error(`Erreur mail`, e);
            }
        }

        if (newListings.length > 0) {
            const merged = [...newListings, ...this.state.listings];
            this.state.listings = this.deduplicate(merged);
            const toCache = this.state.listings.filter(l => l.source && l.source.includes('SeLoger'));
            localStorage.setItem('immo_cache', JSON.stringify(toCache));
        }
    },

    parseGmailMessage(msg, id) {
        const headers = msg.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || "Sans titre";
        const body = this.getBody(msg.payload);
        
        if (subject.toLowerCase().includes("confirmation") || subject.toLowerCase().includes("bienvenue")) {
            return null;
        }

        const cleanBody = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ');
        const snippet = (msg.snippet || "").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        const combined = (cleanBody + " " + snippet).toLowerCase();

        let price = 0;
        const priceMatch = (cleanBody + " " + snippet).match(/(?:\s|^)([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        
        if (priceMatch) {
            price = parseInt(priceMatch[1].replace(/\s/g, ''));
            if (price > 4000000 && (combined.includes("sceaux") || combined.includes("92"))) {
                 const strPrice = price.toString();
                 if (strPrice.startsWith('9')) price = parseInt(strPrice.substring(1));
                 if (price > 4000000) price = 0;
            }
        }

        let rooms = '?';
        let surface = 0;
        const combinedMatch = cleanBody.match(/(\d+)\s*(?:pièce|pce)[s]?\s*[·-]\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
        if (combinedMatch) {
            rooms = combinedMatch[1];
            surface = parseFloat(combinedMatch[2].replace(',', '.'));
        } else {
            const sMatch = cleanBody.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
            const rMatch = cleanBody.match(/(\d+)\s*(?:pièce|pce)[s]?/i);
            surface = sMatch ? parseFloat(sMatch[1].replace(',', '.')) : 0;
            rooms = rMatch ? rMatch[1] : '?';
        }

        if (price === 0 && surface === 0) return null;

        const imgMatch = body.match(/https?:\/\/v\.seloger\.com\/[^"'\s>]+\.(?:jpg|png|jpeg)/i);
        const img = imgMatch ? imgMatch[0] : 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80';
        
        const urlMatch = cleanBody.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const url = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        let city = "Sceaux";
        const cities = ['Sceaux', 'Bourg-la-Reine', 'Antony', 'Clamart'];
        for (let c of cities) {
            if (combined.includes(c.toLowerCase())) {
                city = c;
                break;
            }
        }

        return { id, source: 'SeLoger', city, price, surface, rooms, url, img, date: new Date(parseInt(msg.internalDate)).toISOString() };
    },

    getBody(payload) {
        let body = "";
        try {
            if (payload.body.data) {
                body = decodeURIComponent(escape(window.atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'))));
            } else if (payload.parts) {
                payload.parts.forEach(part => body += this.getBody(part));
            }
        } catch (e) {
            try { body = window.atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch(e2) {}
        }
        return body;
    },

    handleManualAdd(e) {
        if (e) e.preventDefault();
        const city = document.getElementById('add-city').value;
        const price = parseInt(document.getElementById('add-price').value);
        const surface = parseInt(document.getElementById('add-surface').value);
        if (!city || !price) return;

        const entry = { id: 'm-'+Date.now(), source: 'Manuel', city, price, surface, rooms:'?', url:'#', date: new Date().toISOString(), img:'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80' };
        this.state.manualAdditions.unshift(entry);
        localStorage.setItem('immo_manual', JSON.stringify(this.state.manualAdditions));
        this.state.listings.unshift(entry);
        this.closeModal('add-modal');
        this.render();
    },

    toggleFavorite(id) {
        const idx = this.state.favorites.indexOf(id);
        if (idx > -1) this.state.favorites.splice(idx, 1);
        else this.state.favorites.push(id);
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick').includes(viewId)) item.classList.add('active');
        });
        const titles = { 'alerts':'IMMORADAR', 'map':'Carte', 'tour':'Tournée', 'favorites':'Favoris' };
        document.getElementById('view-title').innerHTML = `${titles[viewId] || 'IMMORADAR'} <span style="font-size: 0.6rem; opacity: 0.5;">v1.7.4</span>`;
        this.state.activeView = viewId;
        this.render();
    },

    openModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },
            // Fallback radical : demande l'ID d'abord
            google.accounts.id.prompt();
        }
    },

    handleCredentialResponse(response) {
        // Décodage du JWT
        const base64Url = response.credential.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        this.state.user = JSON.parse(jsonPayload);
        localStorage.setItem('immo_user', JSON.stringify(this.state.user));
        this.updateAuthUI();
    },

    updateAuthUI() {
        const loginBtn = document.getElementById('login-button');
        const logoutBtn = document.getElementById('logout-button');
        if (this.state.user) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (logoutBtn) logoutBtn.classList.remove('hidden');
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (logoutBtn) logoutBtn.classList.add('hidden');
        }
    },

    handleLogoutClick() {
        google.accounts.id.disableAutoSelect();
        this.state.user = null;
        this.state.token = null;
        localStorage.removeItem('immo_user');
        this.updateAuthUI();
        this.render();
    },

    render() {
        if (this.state.activeView === 'alerts') this.renderList('alerts-list', this.state.listings);
        if (this.state.activeView === 'favorites') this.renderList('favorites-list', this.state.listings.filter(l => this.state.favorites.includes(l.id)));
        if (this.state.activeView === 'tour') this.renderTour();
        if (window.lucide) lucide.createIcons();
    },

    renderList(id, items) {
        const container = document.getElementById(id);
        if (!container) return;

        if (!this.state.user) {
            container.innerHTML = `
                <div class="empty-state" style="padding-top: 50px;">
                    <div style="background: rgba(197, 160, 33, 0.1); border: 1px dashed #C5A021; padding: 20px; border-radius: 20px;">
                        <i data-lucide="user-plus" style="width: 40px; height: 40px; color: #C5A021; margin-bottom: 15px;"></i>
                        <h3 style="color: white; margin-bottom: 10px;">Connexion requise</h3>
                        <p style="color: #94A3B8; font-size: 0.9rem; margin-bottom: 20px;">Connectez votre compte Google pour voir vos alertes SeLoger.</p>
                        <button onclick="app.handleAuthClick()" style="background: #C5A021; color: #1A2E35; border: none; padding: 12px 25px; border-radius: 12px; font-weight: 600; cursor: pointer;">Se connecter</button>
                    </div>
                </div>`;
            if (window.lucide) lucide.createIcons();
            return;
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Aucun bien trouvé pour le moment.</p>
                    <button onclick="app.refreshData()" style="margin-top: 10px; opacity: 0.5; background: none; border: 1px solid white; color: white; padding: 10px; border-radius: 10px; cursor: pointer;">Réglages / Sync 🔄</button>
                </div>`;
        } else {
            const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
            container.innerHTML = sorted.map(item => this.createCardHTML(item)).join('');
            if (window.lucide) lucide.createIcons();
        }
    },

    renderTour() {
        const container = document.getElementById('tour-list');
        if (!container) return;
        const threshold = Date.now() - (this.state.tourDaysFilter * 86400000);
        const tourItems = this.state.listings.filter(l => new Date(l.date).getTime() > threshold);
        if (tourItems.length === 0) container.innerHTML = '<p class="empty-state">Aucun bien récent.</p>';
        else container.innerHTML = tourItems.map((item, i) => `<div class="tour-stop"><div class="stop-number">${i+1}</div><div class="stop-info"><h3>${item.city}</h3><p>${item.price.toLocaleString()}€ - ${item.surface}m²</p></div></div>`).join('');
    },

    async refreshData() {
        if (!this.state.user) {
            this.handleAuthClick();
            return;
        }

        const btn = document.querySelector('[onclick="app.refreshData()"] i');
        if (btn) btn.classList.add('animate-spin');

        try {
            this.renderLoading('Connexion Google API...');
            
            // Attente GAPI avec plus de logs
            let retries = 0;
            while (!window.gapi && retries < 15) {
                await new Promise(r => setTimeout(r, 800));
                retries++;
                this.renderLoading(`Attente Google... (${retries}/15)`);
            }

            if (!window.gapi) throw new Error("Impossible de joindre Google (Vérifiez votre connexion)");

            this.renderLoading(`Recherche "SeLoger" sur ${this.state.user.email}...`);
            
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'SeLoger', // Recherche très large
                'maxResults': 30
            });

            const messages = response.result.messages || [];
            if (messages.length === 0) {
                this.renderLoading('Zéro mail "SeLoger" trouvé dans ce compte.');
                return;
            }

            this.renderLoading(`${messages.length} mails trouvés. Analyse en cours...`);
            await this.processMessages(messages);
            this.render();
        } catch (error) {
            console.error('Erreur Sync:', error);
            const msg = error.result?.error?.message || error.message || "Erreur de connexion";
            this.renderLoading(`Erreur : ${msg}`);
        } finally {
            if (btn) btn.classList.remove('animate-spin');
        }
    },

    renderLoading(text) {
        const container = document.getElementById('alerts-list');
        if (container && this.state.activeView === 'alerts') {
            const userEmail = this.state.user ? `<p style="font-size:0.7rem; color:#64748B; margin-top:15px;">Compte : ${this.state.user.email}</p>` : '';
            container.innerHTML = `
                <div class="empty-state" style="padding-top: 50px;">
                    <div style="border: 1px solid rgba(197, 160, 33, 0.2); padding: 25px; border-radius: 20px; background: rgba(0,0,0,0.2);">
                        <div class="animate-spin" style="display:inline-block; margin-bottom:15px; color:#C5A021; font-size:1.5rem;">🔄</div>
                        <p style="color: white; font-size: 0.95rem; font-weight: 500;">${text}</p>
                        ${userEmail}
                    </div>
                </div>`;
        }
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove('hidden');
        
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(viewId)) item.classList.add('active');
        });

        const titles = { 'alerts':'IMMORADAR', 'map':'Carte', 'tour':'Tournée', 'favorites':'Favoris' };
        const titleEl = document.getElementById('view-title');
        if (titleEl) {
            titleEl.innerHTML = `${titles[viewId] || 'IMMORADAR'} <span style="font-size: 0.6rem; opacity: 0.5;">v1.8.9</span>`;
        }
        this.state.activeView = viewId;
        this.render();
    },

    createCardHTML(item) {
        const isFav = this.state.favorites.includes(item.id);
        return `
            <div class="card">
                <div class="card-img-container">
                    <img src="${item.img}" class="card-img">
                    <span class="card-badge">${item.city}</span>
                </div>
                <div class="card-content">
                    <div class="card-price">${(item.price || 0).toLocaleString()} €</div>
                    <div class="card-info"><span>${item.surface} m² | ${item.rooms} pièces</span><span>${new Date(item.date).toLocaleDateString()}</span></div>
                    <div class="card-actions">
                        <a href="${item.url}" target="_blank" class="primary-btn" style="flex:1; text-decoration:none; justify-content:center;">Voir l'annonce</a>
                        <button class="secondary-btn" onclick="app.toggleFavorite('${item.id}')"><i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : 'inherit'}"></i></button>
                    </div>
                </div>
            </div>`;
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
