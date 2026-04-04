/**
 * IMMORADAR - Mobile App Logic
 * Version 3.0.0 - L'Excellence Excellence Release
 * Architecture: Direct REST API (Adieu GAPI & Blocages Safari)
 */

const app = {
    config: {
        CLIENT_ID: '76085489153-uflsgdc6t9u09uvr43rgaj2c74m2tg60.apps.googleusercontent.com',
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly'
    },

    state: {
        activeView: 'alerts',
        listings: [],
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        token: localStorage.getItem('immo_token_raw'),
        isSyncing: false,
        lastUpdate: localStorage.getItem('immo_last_sync')
    },

    /**
     * INITIALISATION v3.0.0
     */
    init() {
        console.log("[IMMORADAR] Boot v3.0.0");
        this.loadLocalData();
        this.render();

        // Récupération automatique du token si présent dans l'URL
        this.checkAuthResponse().then(hasAuth => {
            if (hasAuth || this.state.token) {
                this.sync();
            }
        });
    },

    loadLocalData() {
        try {
            const cached = JSON.parse(localStorage.getItem('immo_cache') || '[]');
            this.state.listings = Array.isArray(cached) ? cached : [];
        } catch(e) { this.state.listings = []; }
    },

    /**
     * AUTHENTIFICATION v3.0.0 (Implicit Flow Robust)
     */
    getAuthUrl() {
        const redirect = window.location.origin + window.location.pathname;
        return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${this.config.CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=${encodeURIComponent(this.config.SCOPES)}&prompt=consent`;
    },

    async checkAuthResponse() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');
        if (token) {
            this.state.token = token;
            localStorage.setItem('immo_token_raw', token);
            window.history.replaceState({}, document.title, window.location.pathname);
            return true;
        }
        return false;
    },

    logout() {
        localStorage.clear();
        window.location.reload();
    },

    /**
     * SYNCHRO v3.0.0 - DIRECT REST API (Stable sur tout iPhone)
     */
    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.render();

        try {
            // 1. Liste des messages SeLoger (Fetch Direct)
            const listResp = await fetch('https://gmail.googleapis.com/v1/users/me/messages?q=SeLoger&maxResults=20', {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });

            if (!listResp.ok) throw new Error("Session expirée");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                this.state.isSyncing = false;
                this.render();
                return;
            }

            // 2. Extraction Parallèle (Vitesse Max)
            const newListings = [];
            const detailsPromises = messages.slice(0, 12).map(msg => 
                fetch(`https://gmail.googleapis.com/v1/users/me/messages/${msg.id}`, {
                    headers: { 'Authorization': `Bearer ${this.state.token}` }
                }).then(r => r.json())
            );

            const detailsResults = await Promise.all(detailsPromises);
            
            detailsResults.forEach(detail => {
                const parsed = this.parseMail(detail);
                if (parsed) newListings.push(parsed);
            });

            if (newListings.length > 0) {
                this.state.listings = newListings;
                localStorage.setItem('immo_cache', JSON.stringify(newListings));
                this.state.lastUpdate = new Date().toLocaleTimeString();
                localStorage.setItem('immo_last_sync', this.state.lastUpdate);
            }

        } catch (error) {
            console.error("Sync Error:", error);
            if (error.message.includes("expirée")) {
                this.state.token = null;
                localStorage.removeItem('immo_token_raw');
            }
        } finally {
            this.state.isSyncing = false;
            this.render();
        }
    },

    /**
     * PARSING PREMIUM v3.0.0 (Photos HD, Prix m²)
     */
    parseMail(msg) {
        const payload = msg.payload;
        const body = this.extractBody(payload);
        const clean = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        
        // PRIX
        let price = 0;
        const pMatch = clean.match(/([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        if (pMatch) price = parseInt(pMatch[1].replace(/\s/g, ''));
        if (price < 10000) return null;

        // SURFACE
        let surface = 0;
        const sMatch = clean.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
        surface = sMatch ? parseFloat(sMatch[1].replace(',', '.')) : 0;

        // PRIX m²
        const pricePerM2 = surface > 0 ? Math.round(price / surface) : 0;

        // VILLE
        let city = "92";
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay', 'Verrières'];
        for (let c of cities) {
            if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }
        }

        // PHOTOS HD (Extraction plus fine)
        const allImgs = body.match(/https?:\/\/[^"'\s>]+\.(?:jpg|png|jpeg)/gi) || [];
        const filteredImgs = allImgs.filter(url => url.includes('seloger') || url.includes('v.seloger'));
        const img = filteredImgs.length > 0 ? filteredImgs[0] : 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80';

        // URL ANNONCE
        const urlMatch = body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const url = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        return { 
            id: msg.id, 
            city, 
            price, 
            surface, 
            pricePerM2,
            url, 
            img, 
            date: new Date(parseInt(msg.internalDate)).toISOString() 
        };
    },

    extractBody(payload) {
        let body = "";
        if (payload.body.data) {
            body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (payload.parts) {
            payload.parts.forEach(part => body += this.extractBody(part));
        }
        return body;
    },

    /**
     * UI & RENDERING v3.0.0
     */
    switchView(viewId) {
        this.state.activeView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelector(`[onclick*="${viewId}"]`).classList.add('active');
        this.render();
    },

    render() {
        // 1. Bouton Login (Vercel Ready)
        const loginContainer = document.getElementById('login-wall');
        const mainContent = document.getElementById('main-content');
        
        if (!this.state.token) {
            loginContainer.style.display = 'flex';
            mainContent.style.display = 'none';
            document.getElementById('btn-auth').href = this.getAuthUrl();
            return;
        } else {
            loginContainer.style.display = 'none';
            mainContent.style.display = 'block';
        }

        // 2. Liste des Alertes
        const list = document.getElementById('alerts-list');
        if (!list) return;

        if (this.state.isSyncing && this.state.listings.length === 0) {
            list.innerHTML = `<div class="loader-container"><div class="spinner"></div><p>Analyse de vos alertes...</p></div>`;
            return;
        }

        if (this.state.listings.length === 0) {
            list.innerHTML = `<div class="empty-state"><h3>Rien à signaler !</h3><p>Aucune nouvelle offre détectée.</p></div>`;
        } else {
            const sorted = [...this.state.listings].sort((a,b) => new Date(b.date) - new Date(a.date));
            list.innerHTML = sorted.map(item => this.createCard(item)).join('');
        }

        // 3. Carte (Placeholder interactif)
        const mapCount = document.getElementById('map-count');
        if (mapCount) mapCount.innerText = `${this.state.listings.length} biens localisés`;

        if (window.lucide) lucide.createIcons();
    },

    createCard(item) {
        const isFav = this.state.favorites.includes(item.id);
        return `
            <div class="property-card">
                <div class="card-image" style="background-image: url('${item.img}')">
                    <span class="badge-city">${item.city}</span>
                </div>
                <div class="card-details">
                    <div class="price-row">
                        <span class="price">${item.price.toLocaleString()} €</span>
                        <span class="surface">${item.surface} m²</span>
                    </div>
                    <div class="extra-row">
                        <span class="price-m2">${item.pricePerM2.toLocaleString()} €/m²</span>
                        <span class="date">${new Date(item.date).toLocaleDateString()}</span>
                    </div>
                    <div class="card-actions">
                        <a href="${item.url}" target="_blank" class="btn-primary">DÉTAILS</a>
                        <button class="btn-fav" onclick="app.toggleFav('${item.id}')">
                            <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : '#FFF'}"></i>
                        </button>
                    </div>
                </div>
            </div>`;
    },

    toggleFav(id) {
        const idx = this.state.favorites.indexOf(id);
        if (idx > -1) this.state.favorites.splice(idx, 1);
        else this.state.favorites.push(id);
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
