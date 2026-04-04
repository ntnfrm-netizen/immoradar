/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 * Version 2.8.2 - Instant Boot Build
 * Fixed: Startup deadlock on iPhone Safari
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
        isSyncing: false,
        searchFinished: false
    },

    logToUI(message) {
        console.log("[IMMORADAR]", message);
        const log = document.getElementById('debug-log');
        if (log) {
            log.innerText = message;
            log.style.display = 'block';
        }
    },

    /**
     * INIT v2.8.2 - Async & Non-blocking
     */
    init() {
        this.logToUI("Prêt v2.8.2");
        
        const diag = document.getElementById('diag-url');
        if (diag) diag.innerText = window.location.origin + window.location.pathname;

        this.loadLocalData();
        this.initGoogleAuth();
        this.render();

        // On lance la vérification de l'URL sans bloquer le reste
        this.checkAuthResponseInUrl().then(hasAuth => {
            if (!hasAuth && this.state.token && !this.state.isSyncing) {
                this.refreshData();
            }
        });
    },

    loadLocalData() {
        try {
            const cached = JSON.parse(localStorage.getItem('immo_cache') || '[]');
            this.state.listings = Array.isArray(cached) ? cached : [];
        } catch(e) { this.state.listings = []; }
    },

    getAuthUrl() {
        const redirect = window.location.origin + window.location.pathname;
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.config.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${encodeURIComponent(this.config.SCOPES)}&prompt=consent`;
    },

    initGoogleAuth() {
        const user = localStorage.getItem('immo_user');
        const token = localStorage.getItem('immo_token_raw');
        if (user) this.state.user = JSON.parse(user);
        if (token) this.state.token = token;
        
        // Branchement du bouton si présent
        const v = document.getElementById('btn-vercel');
        if (v) v.href = this.getAuthUrl();
    },

    async checkAuthResponseInUrl() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            this.state.token = token;
            localStorage.setItem('immo_token_raw', token);
            window.history.replaceState({}, document.title, window.location.pathname);
            this.refreshData();
            return true;
        }
        return false;
    },

    async ensureGapiClient() {
        if (window.gapi && gapi.client && gapi.client.gmail) return true;

        return new Promise((resolve, reject) => {
            const check = () => {
                if (window.gapi) {
                    gapi.load('client', {
                        callback: () => {
                            gapi.client.init({
                                apiKey: this.config.API_KEY,
                                discoveryDocs: this.config.DISCOVERY_DOCS
                            }).then(resolve).catch(reject);
                        },
                        onerror: () => reject(new Error("GAPI Fail"))
                    });
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    },

    async refreshData() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.state.searchFinished = false;
        this.render();

        const btn = document.querySelector('.icon-btn i');
        if (btn) btn.classList.add('animate-spin');

        try {
            await this.ensureGapiClient();
            gapi.client.setToken({ access_token: this.state.token });
            
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'q': 'SeLoger',
                'maxResults': 30
            });

            const messages = response.result.messages || [];
            if (messages.length === 0) {
                this.state.searchFinished = true;
                this.render();
                return;
            }

            await this.processMessages(messages);
            this.state.searchFinished = true;
            this.render();
        } catch (error) {
            this.logToUI("Sync: " + (error.message || "Err"));
            this.state.searchFinished = true;
            this.render();
        } finally {
            this.state.isSyncing = false;
            if (btn) btn.classList.remove('animate-spin');
        }
    },

    async processMessages(messages) {
        const newListings = [];
        const items = messages.slice(0, 15);
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
        const body = this.getBody(payload);
        const cleanBody = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        
        let price = 0;
        const priceMatch = cleanBody.match(/([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        if (priceMatch) price = parseInt(priceMatch[1].replace(/\s/g, ''));
        if (price < 10000) return null;

        let surface = 0;
        const sMatch = cleanBody.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
        surface = sMatch ? parseFloat(sMatch[1].replace(',', '.')) : 0;

        let city = "92";
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay', 'Verrières'];
        for (let c of cities) {
            if (cleanBody.toLowerCase().includes(c.toLowerCase())) { city = c; break; }
        }

        const imgMatch = body.match(/https?:\/\/[^"'\s>]+\.(?:jpg|png|jpeg)/i);
        const img = imgMatch ? imgMatch[0] : 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80';
        
        return { id, source: 'SeLoger', city, price, surface, rooms: '?', url: 'https://www.seloger.com', img, date: new Date(parseInt(msg.internalDate)).toISOString() };
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
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick').includes(viewId)) item.classList.add('active');
        });
        this.state.activeView = viewId;
        this.render();
    },

    render() {
        const container = document.getElementById('alerts-list');
        if (!container) return;

        if (!this.state.token) {
            document.getElementById('fallback-login').style.display = 'block';
            return;
        } else {
            document.getElementById('fallback-login').style.display = 'none';
        }

        if (this.state.activeView === 'favorites') {
            const favs = this.state.listings.filter(l => this.state.favorites.includes(l.id));
            container.innerHTML = favs.length ? favs.map(l => this.createCardHTML(l)).join('') : '<div class="empty-state"><h3>Favoris</h3><p>Aucun bien pour l\'instant.</p></div>';
        } else if (this.state.activeView === 'alerts') {
            if (this.state.isSyncing && this.state.listings.length === 0) {
                container.innerHTML = '<div class="empty-state"><div class="animate-spin" style="font-size:2rem; color:#C5A021;">🔄</div><h3>Recherche en cours...</h3></div>';
            } else if (this.state.listings.length === 0 && this.state.searchFinished) {
                container.innerHTML = '<div class="empty-state"><h3>À jour !</h3><p>Aucune nouvelle annonce aujourd\'hui.</p></div>';
            } else {
                container.innerHTML = this.state.listings.map(l => this.createCardHTML(l)).join('');
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    createCardHTML(item) {
        const isFav = this.state.favorites.includes(item.id);
        return `
            <div class="card">
                <img src="${item.img}" class="card-img" style="height:120px; object-fit:cover;">
                <div class="card-content">
                    <div class="card-price">${item.price.toLocaleString()} €</div>
                    <div class="card-info">${item.surface} m² | ${item.city}</div>
                    <div class="card-actions">
                        <button class="primary-btn">VOIR</button>
                        <button class="secondary-btn" onclick="app.toggleFavorite('${item.id}')"><i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color:${isFav ? '#C5A021' : '#FFF'}"></i></button>
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
