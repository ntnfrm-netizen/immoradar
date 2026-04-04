/**
 * IMMORADAR - Mobile App Logic
 * Version 3.0.1 - FINAL VERIFIED BUILD
 * Fixed: Class specificity, Safe Areas, City Detection
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
        isSyncing: false
    },

    init() {
        console.log("[IMMORADAR] v3.0.1 Verified");
        this.loadLocalData();
        this.render();

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

    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.render();

        try {
            const listResp = await fetch('https://gmail.googleapis.com/v1/users/me/messages?q=SeLoger&maxResults=20', {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            if (!listResp.ok) throw new Error("Expired");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            const detailsResults = await Promise.all(
                messages.slice(0, 15).map(msg => 
                    fetch(`https://gmail.googleapis.com/v1/users/me/messages/${msg.id}`, {
                        headers: { 'Authorization': `Bearer ${this.state.token}` }
                    }).then(r => r.json())
                )
            );

            const newListings = [];
            detailsResults.forEach(detail => {
                const parsed = this.parseMail(detail);
                if (parsed) newListings.push(parsed);
            });

            if (newListings.length > 0) {
                this.state.listings = newListings;
                localStorage.setItem('immo_cache', JSON.stringify(newListings));
            }
        } catch (e) {
            if (e.message === "Expired") {
                this.state.token = null;
                localStorage.removeItem('immo_token_raw');
            }
        } finally {
            this.state.isSyncing = false;
            this.render();
        }
    },

    parseMail(msg) {
        const payload = msg.payload;
        const body = this.extractBody(payload);
        const clean = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
        
        let price = 0;
        const pMatch = clean.match(/([0-9]{1,3}(?:\s[0-9]{3})*|[0-9]{4,10})\s*(?:€|EUR)/i);
        if (pMatch) price = parseInt(pMatch[1].replace(/\s/g, ''));
        if (price < 10000) return null;

        let surface = 0;
        const sMatch = clean.match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:m²|m2)/i);
        surface = sMatch ? parseFloat(sMatch[1].replace(',', '.')) : 0;
        const pricePerM2 = surface > 0 ? Math.round(price / surface) : 0;

        let city = "Hauts-de-Seine";
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay', 'Verrières'];
        for (let c of cities) {
            if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }
        }

        const allImgs = body.match(/https?:\/\/[^"'\s>]+\.(?:jpg|png|jpeg)/gi) || [];
        const filteredImgs = allImgs.filter(url => url.includes('seloger') || url.includes('v.seloger'));
        const img = filteredImgs.length > 0 ? filteredImgs[0] : 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80';

        const urlMatch = body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const url = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        return { id: msg.id, city, price, surface, pricePerM2, url, img, date: new Date(parseInt(msg.internalDate)).toISOString() };
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

    switchView(viewId) {
        this.state.activeView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab-item[onclick*="${viewId}"]`).classList.add('active');
        this.render();
    },

    render() {
        const wall = document.getElementById('login-wall');
        const main = document.getElementById('main-content');
        
        if (!this.state.token) {
            wall.classList.remove('hidden');
            wall.style.display = 'flex';
            main.classList.add('hidden');
            main.style.display = 'none';
            document.getElementById('btn-auth').href = this.getAuthUrl();
        } else {
            wall.classList.add('hidden');
            wall.style.display = 'none';
            main.classList.remove('hidden');
            main.style.display = 'block';
        }

        const list = document.getElementById('alerts-list');
        if (list) {
            if (this.state.isSyncing && this.state.listings.length === 0) {
                list.innerHTML = `<div class="loader-container"><div class="spinner"></div><p>Synchronisation Premium...</p></div>`;
            } else {
                const results = this.state.activeView === 'favorites' ? 
                                this.state.listings.filter(l => this.state.favorites.includes(l.id)) : 
                                this.state.listings;
                list.innerHTML = results.length ? results.map(item => this.createCard(item)).join('') : `<div class="empty-state"><h3>Rien à signaler</h3></div>`;
            }
        }
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
                        <a href="${item.url}" target="_blank" class="btn-primary">VOIR</a>
                        <button class="btn-fav" onclick="app.toggleFav('${item.id}')">
                            <i data-lucide="heart" ${isFav ? 'fill="#D4AF37"' : ''} style="color: ${isFav ? '#D4AF37' : '#FFF'}"></i>
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
