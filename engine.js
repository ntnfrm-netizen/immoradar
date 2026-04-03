/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 * Version 1.9.0 - Final Rescue Build
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
        listings: [],
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        manualAdditions: JSON.parse(localStorage.getItem('immo_manual') || '[]'),
        user: null,
        token: null
    },

    async init() {
        // NETTOYAGE ATOMIQUE V1.9.0
        if (localStorage.getItem('immo_v1.9.0_reset') !== 'true') {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('immo_')) {
                    localStorage.removeItem(key);
                }
            }
            localStorage.setItem('immo_v1.9.0_reset', 'true');
        }

        this.bindEvents();
        this.loadLocalData();
        this.checkAuthResponseInUrl();
        this.initGoogleAuth();
        this.render();

        // Message de bienvenue éphémère
        setTimeout(() => {
            this.renderLoading('IMMORADAR v1.9.0 PRÊT');
            setTimeout(() => this.render(), 1200);
        }, 500);
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

    loadLocalData() {
        const cached = JSON.parse(localStorage.getItem('immo_cache') || '[]');
        const manual = JSON.parse(localStorage.getItem('immo_manual') || '[]');
        // ULTRA-FILTER
        const rawList = [...cached, ...manual].filter(item => item && item.price > 50000);
        this.state.listings = this.deduplicate(rawList);
        this.state.manualAdditions = manual;
    },

    deduplicate(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = `${(item.city || "").toLowerCase().trim()}-${Math.floor(item.price || 0)}-${Math.floor(item.surface || 0)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    },

    getAuthUrl(variant = 'auto') {
        let rootUrl = window.location.origin + window.location.pathname;
        if (variant === 'slash') {
            if (rootUrl.endsWith('index.html')) rootUrl = rootUrl.replace('index.html', '');
            if (!rootUrl.endsWith('/')) rootUrl += '/';
        } else if (variant === 'no-slash') {
            if (rootUrl.endsWith('/')) rootUrl = rootUrl.substring(0, rootUrl.length - 1);
        } else if (variant === 'index') {
            if (!rootUrl.endsWith('index.html')) {
                if (!rootUrl.endsWith('/')) rootUrl += '/';
                rootUrl += 'index.html';
            }
        }
        
        return `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.config.CLIENT_ID}&redirect_uri=${encodeURIComponent(rootUrl)}&` +
            `response_type=token&scope=${encodeURIComponent(this.config.SCOPES)}&prompt=consent`;
    },

    initGoogleAuth() {
        if (!window.google) {
            setTimeout(() => this.initGoogleAuth(), 1000);
            return;
        }

        // Tente de récupérer un utilisateur ou un token déjà connecté
        const user = localStorage.getItem('immo_user');
        const token = localStorage.getItem('immo_token_raw');
        if (user) this.state.user = JSON.parse(user);
        if (token) this.state.token = token;
        
        this.updateAuthUI();
    },

    handleAuthClick(e) {
        if (e) e.preventDefault();
        const authUrl = this.getAuthUrl();
        window.location.href = authUrl;
    },

    updateAuthUI() {
        const loginBtn = document.getElementById('login-button');
        const logoutBtn = document.getElementById('logout-button');
        const authUrl = this.getAuthUrl('slash'); // On essaye 'slash' par défaut

        if (loginBtn) {
            loginBtn.href = authUrl;
            if (this.state.user) loginBtn.classList.add('hidden');
            else loginBtn.classList.remove('hidden');
        }

        if (logoutBtn) {
            if (this.state.user) logoutBtn.classList.remove('hidden');
            else logoutBtn.classList.add('hidden');
        }
    },

    handleLogoutClick() {
        this.state.user = null;
        this.state.token = null;
        localStorage.removeItem('immo_user');
        localStorage.removeItem('immo_token_raw');
        this.updateAuthUI();
        this.render();
    },

    async checkAuthResponseInUrl() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            this.logToUI("Nouvelle connexion détectée.");
            this.state.token = token;
            localStorage.setItem('immo_token_raw', token);
            window.history.replaceState({}, document.title, window.location.pathname);
            
            try {
                const infoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const userData = await infoResp.json();
                if (userData && userData.email) {
                    this.state.user = userData;
                    localStorage.setItem('immo_user', JSON.stringify(userData));
                    this.logToUI("Connecté en tant que: " + userData.email);
                }
            } catch (e) { this.logToUI("Erreur Profil: " + e.message); }
            
            this.updateAuthUI();
            this.refreshData();
            return true;
        }
        return false;
    },

    async refreshData() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;

        const btn = document.querySelector('[onclick="app.refreshData()"] i');
        if (btn) btn.classList.add('animate-spin');

        try {
            this.logToUI("Connexion aux serveurs Google...");
            let retries = 0;
            while (!window.gapi && retries < 25) {
                await new Promise(r => setTimeout(r, 600));
                retries++;
            }

            if (!window.gapi) throw new Error("Connexion Google impossible (Vérifiez votre réseau)");

            await gapi.client.init({
                apiKey: this.config.API_KEY,
                discoveryDocs: this.config.DISCOVERY_DOCS,
            });

            gapi.client.setToken({ access_token: this.state.token });
            this.renderLoading(`Recherche de vos alertes SeLoger...`);
            
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'SeLoger',
                'maxResults': 40
            });

            const messages = response.result.messages || [];
            if (messages.length === 0) {
                this.logToUI("Aucun mail SeLoger trouvé.");
                this.renderLoading('Zéro annonce trouvée. Vérifiez vos alertes SeLoger.');
                return;
            }

            this.logToUI(`${messages.length} mails trouvés. Extraction en cours...`);
            await this.processMessages(messages);
            this.logToUI("Mise à jour terminée.");
            this.render();
        } catch (error) {
            this.logToUI("Erreur: " + (error.message || "Problème de synchronisation"));
            const msg = error.result?.error?.message || error.message || "Erreur Google";
            this.renderLoading(`<span style="color:#EF4444;">Détail :</span> ${msg}<br><br><button onclick="app.handleLogoutClick()" style="background:#64748B; color:white; border:none; padding:10px; border-radius:10px;">Réinitialiser la session</button>`);
            localStorage.removeItem('immo_token_raw');
        } finally {
            this.state.isSyncing = false;
            if (btn) btn.classList.remove('animate-spin');
        }
    },

    renderLoading(text) {
        const container = document.getElementById('alerts-list');
        if (container && this.state.activeView === 'alerts') {
            const userEmail = this.state.user ? `<p style="font-size:0.75rem; color:#C5A021; margin-top:15px; opacity:0.8;">${this.state.user.email}</p>` : '';
            container.innerHTML = `
                <div class="empty-state" style="padding-top: 50px;">
                    <div style="border: 1px solid #C5A021; padding: 30px; border-radius: 20px; background: rgba(197,160,33,0.05); box-shadow: 0 0 30px rgba(0,0,0,0.5);">
                        <div class="animate-spin" style="display:inline-block; margin-bottom:15px; color:#C5A021; font-size:1.8rem;">🔄</div>
                        <p style="color: white; font-size: 1.1rem; font-weight: 600;">${text}</p>
                        ${userEmail}
                    </div>
                </div>`;
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
                if (parsed && parsed.price > 50000) newListings.push(parsed);
            } catch (e) {}
        }

        if (newListings.length > 0) {
            this.state.listings = this.deduplicate([...newListings, ...this.state.listings]);
            const toCache = this.state.listings.filter(l => l.source && l.source.includes('SeLoger'));
            localStorage.setItem('immo_cache', JSON.stringify(toCache));
        }
    },

    parseGmailMessage(msg, id) {
        const headers = msg.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || "";
        const body = this.getBody(msg.payload);
        if (subject.toLowerCase().includes("confirmation") || subject.toLowerCase().includes("bienvenue")) return null;

        const cleanBody = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        const snippet = (msg.snippet || "").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        const combined = (cleanBody + " " + snippet).toLowerCase();

        let price = 0;
        const priceMatch = (cleanBody + " " + snippet).match(/(?:\s|^)([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        if (priceMatch) price = parseInt(priceMatch[1].replace(/\s/g, ''));

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
        const cities = ['Sceaux', 'Bourg-la-Reine', 'Antony', 'Clamart', 'Châtenay-Malabry'];
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

    getAuthUrl(variant = 'slash') {
        const base = "https://accounts.google.com/o/oauth2/v2/auth";
        const clientId = "76085489153-uflsgdc6t9u09uvr43rgaj2c74m2tg60.apps.googleusercontent.com";
        const scopes = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/userinfo.email");
        
        let redirect = "https://ntnfrm-netizen.github.io/immoradar/";
        if (variant === 'index') redirect += "index.html";
        if (variant === 'simple') redirect = "https://ntnfrm-netizen.github.io/immoradar";
        if (variant === 'auto') redirect = window.location.origin + window.location.pathname;

        return `${base}?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${scopes}`;
    },

    async init() {
        this.logToUI("Démarrage v2.4.0...");
        
        // Diagnostic visuel de l'URL pour Marie-Astrid
        const diag = document.getElementById('diag-url');
        const currentUrl = window.location.origin + window.location.pathname;
        if (diag) diag.innerText = currentUrl;

        // Activation des boutons statiques (Sécurité iPhone)
        const o4 = document.getElementById('opt4');
        const o1 = document.getElementById('opt1');
        const o2 = document.getElementById('opt2');
        const o3 = document.getElementById('opt3');
        if (o4) o4.href = this.getAuthUrl('auto');
        if (o1) o1.href = this.getAuthUrl('slash');
        if (o2) o2.href = this.getAuthUrl('index');
        if (o3) o3.href = this.getAuthUrl('simple');

        // 1. Analyse l'URL (si retour de Google)
        const hasAuthInUrl = await this.checkAuthResponseInUrl();
        
        // 2. Charge la session locale
        this.initGoogleAuth();
        this.render();
        
        // 3. Lancement automatique de la synchro si identifié et pas déjà en cours
        if (this.state.token && !hasAuthInUrl && !this.state.isSyncing) {
            this.refreshData();
        }
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

        // En v2.3.0, on ne touche plus au contenu si pas d'utilisateur (les boutons statiques sont là)
        if (!this.state.user) {
            return;
        }

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>Aucun bien trouvé pour le moment.</p>
                    <button onclick="app.refreshData()" style="margin-top: 15px; opacity: 0.8; background: #C5A021; border: none; color: #1A2E35; padding: 12px 20px; border-radius: 12px; font-weight: 600; cursor: pointer;">Actualiser maintenant 🔄</button>
                </div>`;
        } else {
            const sorted = [...items].sort((a, b) => new Date(b.date) - new Date(a.date));
            container.innerHTML = sorted.map(item => this.createCardHTML(item)).join('');
            if (window.lucide) lucide.createIcons();
        }
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
    },

    switchView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const targetView = document.getElementById(`view-${viewId}`);
        if (targetView) targetView.classList.remove('hidden');
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(viewId)) item.classList.add('active');
        });
        const titleEl = document.getElementById('view-title');
        const titles = { 'alerts':'IMMORADAR', 'map':'Carte', 'tour':'Tournée', 'favorites':'Favoris' };
        if (titleEl) titleEl.innerHTML = `${titles[viewId] || 'IMMORADAR'} <span style="font-size: 0.6rem; opacity: 0.5;">v2.2.2</span>`;
        this.state.activeView = viewId;
        this.render();
    },

    openModal(id) { document.getElementById(id).classList.remove('hidden'); },
    closeModal(id) { document.getElementById(id).classList.add('hidden'); },

    renderTour() {
        const container = document.getElementById('tour-list');
        if (!container) return;
        const tourItems = this.state.listings.slice(0, 10);
        if (tourItems.length === 0) container.innerHTML = '<p class="empty-state">Aucun bien récent.</p>';
        else container.innerHTML = tourItems.map((item, i) => `<div class="tour-stop"><div class="stop-number">${i+1}</div><div class="stop-info"><h3>${item.city}</h3><p>${item.price.toLocaleString()}€ - ${item.surface}m²</p></div></div>`).join('');
    },

    toggleFavorite(id) {
        const idx = this.state.favorites.indexOf(id);
        if (idx > -1) this.state.favorites.splice(idx, 1);
        else this.state.favorites.push(id);
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    },

    handleManualAdd(e) {
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
    }
};

function emergencyClear() { app.clearAppCache(); }

document.addEventListener('DOMContentLoaded', () => app.init());
