/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 * Version 2.8.0 - Vercel Synchronization Build
 * Fixed: GAPI Initialization Race Condition & Dynamic Vercel Origin
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
        user: null,
        token: null,
        isSyncing: false
    },

    logToUI(message) {
        console.log("[IMMORADAR]", message);
        const log = document.getElementById('debug-log');
        if (log) {
            log.innerText = message;
            log.style.display = 'block';
        }
    },

    async init() {
        this.logToUI("Vérification v2.8.0...");
        
        const diag = document.getElementById('diag-url');
        const currentUrl = window.location.origin + window.location.pathname;
        if (diag) diag.innerText = currentUrl;

        const b = document.getElementById('btn-detective');
        if (b) b.href = this.getAuthUrl('auto');

        const v = document.getElementById('btn-vercel');
        if (v) v.href = this.getAuthUrl('auto');

        this.loadLocalData();
        const hasAuthInUrl = await this.checkAuthResponseInUrl();
        this.initGoogleAuth();
        this.render();
        
        if (this.state.token && !hasAuthInUrl && !this.state.isSyncing) {
            this.refreshData();
        }
    },

    loadLocalData() {
        const cached = JSON.parse(localStorage.getItem('immo_cache') || '[]');
        this.state.listings = cached.filter(item => item && item.price > 10000);
    },

    getAuthUrl(variant = 'auto') {
        let redirect = "https://ntnfrm-netizen.github.io/immoradar/";
        if (variant === 'auto') redirect = window.location.origin + window.location.pathname;
        
        return `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${this.config.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&` +
            `response_type=token&scope=${encodeURIComponent(this.config.SCOPES)}&prompt=consent`;
    },

    initGoogleAuth() {
        const user = localStorage.getItem('immo_user');
        const token = localStorage.getItem('immo_token_raw');
        if (user) this.state.user = JSON.parse(user);
        if (token) this.state.token = token;
        this.render();
    },

    async checkAuthResponseInUrl() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            this.logToUI("Authentification validée !");
            this.state.token = token;
            localStorage.setItem('immo_token_raw', token);
            window.history.replaceState({}, document.title, window.location.pathname);
            
            this.refreshData();
            return true;
        }
        return false;
    },

    /**
     * Waiting for GAPI with safety (Fix for undefined gapi.client)
     */
    async ensureGapiClient() {
        let attempts = 0;
        while (!window.gapi && attempts < 20) {
            await new Promise(r => setTimeout(r, 300));
            attempts++;
        }
        if (!window.gapi) throw new Error("Google API introuvable");

        return new Promise((resolve, reject) => {
            gapi.load('client', {
                callback: () => {
                   gapi.client.init({
                        apiKey: this.config.API_KEY,
                        discoveryDocs: this.config.DISCOVERY_DOCS
                    }).then(resolve).catch(reject);
                },
                onerror: () => reject(new Error("Erreur chargement GAPI Client"))
            });
        });
    },

    async refreshData() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;

        const btn = document.querySelector('.icon-btn i');
        if (btn) btn.classList.add('animate-spin');

        try {
            this.logToUI("Connexion à Google Cloud...");
            await this.ensureGapiClient();
            
            gapi.client.setToken({ access_token: this.state.token });
            this.renderLoading(`Recherche des annonces SeLoger...`);
            
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'SeLoger',
                'maxResults': 30
            });

            const messages = response.result.messages || [];
            if (messages.length === 0) {
                this.logToUI("Aucun mail SeLoger trouvé.");
                this.render();
                return;
            }

            await this.processMessages(messages);
            this.logToUI("Mise à jour v2.8.0 terminée.");
            this.render();
        } catch (error) {
            this.logToUI("Erreur Google: " + (error.message || "Erreur réseau"));
            this.render();
        } finally {
            this.state.isSyncing = false;
            if (btn) btn.classList.remove('animate-spin');
        }
    },

    renderLoading(text) {
        const container = document.getElementById('alerts-list');
        if (container && this.state.activeView === 'alerts') {
            container.innerHTML = `
                <div class="empty-state" style="padding-top: 50px;">
                    <div style="border: 1px solid #C5A021; padding: 30px; border-radius: 20px; background: rgba(197,160,33,0.05);">
                        <p style="color: white; font-size: 1.1rem; font-weight:600;">${text}</p>
                        <div class="animate-spin" style="margin-top:20px; color:#C5A021;">🔄</div>
                    </div>
                </div>`;
        }
    },

    async processMessages(messages) {
        const newListings = [];
        const items = messages.slice(0, 10);
        for (const msg of items) {
            try {
                const detail = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': msg.id });
                const parsed = this.parseGmailMessage(detail.result, msg.id);
                if (parsed) newListings.push(parsed);
            } catch (e) {}
        }
        if (newListings.length > 0) {
            this.state.listings = newListings;
            localStorage.setItem('immo_cache', JSON.stringify(newListings));
        }
    },

    parseGmailMessage(msg, id) {
        const payload = msg.payload;
        const subject = payload.headers.find(h => h.name === 'Subject')?.value || "";
        const body = this.getBody(payload);
        const cleanBody = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        
        let price = 0;
        const priceMatch = cleanBody.match(/([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        if (priceMatch) price = parseInt(priceMatch[1].replace(/\s/g, ''));
        if (price < 10000) return null;

        let surface = 0;
        const sMatch = cleanBody.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
        surface = sMatch ? parseFloat(sMatch[1].replace(',', '.')) : 0;

        const imgMatch = body.match(/https?:\/\/v\.seloger\.com\/[^"'\s>]+\.(?:jpg|png|jpeg)/i);
        const img = imgMatch ? imgMatch[0] : 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80';
        
        const urlMatch = body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const url = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        return { id, source: 'SeLoger', city: "Sceaux", price, surface, rooms: '?', url, img, date: new Date(parseInt(msg.internalDate)).toISOString() };
    },

    getBody(payload) {
        let body = "";
        if (payload.body.data) {
            body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (payload.parts) {
            payload.parts.forEach(part => body += this.getBody(part));
        }
        return body;
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
        const titles = { 'alerts':'IMMORADAR', 'map':'Carte', 'favorites':'Favoris' };
        if (titleEl) titleEl.innerHTML = `${titles[viewId] || 'IMMORADAR'} <span style="font-size: 0.6rem; opacity: 0.5;">v2.8.0</span>`;
        this.state.activeView = viewId;
        this.render();
    },

    render() {
        const container = document.getElementById('alerts-list');
        if (!container) return;

        if (this.state.activeView === 'favorites') {
            const favs = this.state.listings.filter(l => (this.state.favorites || []).includes(l.id));
            container.innerHTML = favs.length ? favs.map(l => this.createCardHTML(l)).join('') : '<p class="empty-state">Aucun favori.</p>';
        } else if (this.state.activeView === 'alerts') {
            if (!this.state.token) return;
            container.innerHTML = this.state.listings.length ? this.state.listings.map(l => this.createCardHTML(l)).join('') : '<p class="empty-state">Recherche en cours...</p>';
        }
        if (window.lucide) lucide.createIcons();
    },

    createCardHTML(item) {
        const isFav = (this.state.favorites || []).includes(item.id);
        return `
            <div class="card">
                <img src="${item.img}" class="card-img">
                <div class="card-content">
                    <div class="card-price">${item.price.toLocaleString()} €</div>
                    <div class="card-info">${item.surface} m² | ${item.city}</div>
                    <div class="card-actions">
                        <a href="${item.url}" target="_blank" class="primary-btn">Voir</a>
                        <button class="secondary-btn" onclick="app.toggleFavorite('${item.id}')"><i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''}></i></button>
                    </div>
                </div>
            </div>`;
    },

    toggleFavorite(id) {
        const idx = this.state.favorites.indexOf(id);
        if (idx > -1) this.state.favorites.splice(idx, 1);
        else this.state.favorites.push(id);
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
