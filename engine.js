/**
 * IMMORADAR - Mobile App Logic
 * Version 3.1.0 - Humble & Target Build
 * Features: Laser Sync (from SeLoger), Humble UI logic
 */

const app = {
    config: {
        CLIENT_ID: '76085489153-uflsgdc6t9u09uvr43rgaj2c74m2tg60.apps.googleusercontent.com',
        SCOPES: 'https://www.googleapis.com/auth/gmail.readonly'
    },

    state: {
        activeView: 'annonces',
        filter: 'all',
        listings: [],
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        token: localStorage.getItem('immo_token_raw'),
        isSyncing: false
    },

    init() {
        console.log("[IMMORADAR] v3.1.0 Humble Target");
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

    /**
     * SYNC LASER v3.1.0
     * Target: seloger-alertes@seloger.com
     */
    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.render();

        try {
            const query = encodeURIComponent('from:seloger-alertes@seloger.com');
            const listResp = await fetch(`https://gmail.googleapis.com/v1/users/me/messages?q=${query}&maxResults=40`, {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            
            if (!listResp.ok) throw new Error("Expired");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                this.state.isSyncing = false;
                this.render();
                return;
            }

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
        
        // PRIX doré
        const pMatch = clean.match(/([0-9]{1,3}[ \t\u00A0]*[0-9]{3}|[0-9]{4,10})[ \t\u00A0]*(?:€|EUR)/i);
        if (!pMatch) return null;
        const price = parseInt(pMatch[1].replace(/[\s\t\u00A0]/g, ''));
        if (price < 500) return null;

        // TYPE (Appt / Maison)
        let type = clean.includes('maison') ? 'Maison' : 'Appartement';
        let rooms = clean.match(/([0-9]+)\s*p/i);
        rooms = rooms ? rooms[1] : '?';

        // SURFACE
        let surface = clean.match(/([0-9]+(?:[.,][0-9]+)?)[ \t\u00A0]*(?:m²|m2)/i);
        surface = surface ? Math.round(parseFloat(surface[1].replace(',', '.'))) : 0;

        // VILLE
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay', 'Verrières'];
        let city = "92";
        for (let c of cities) if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }

        // BADGE STATUS
        let status = "Nouveau";
        if (clean.includes('exclusif')) status = "Exclusif";
        if (clean.includes('réduit') || clean.includes('baisse')) status = "Prix réduit";

        const urlMatch = body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i);
        const url = urlMatch ? urlMatch[0] : 'https://www.seloger.com';

        return { id: msg.id, type, rooms, city, price, surface, status, url, date: new Date(parseInt(msg.internalDate)).toISOString() };
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
        document.getElementById(`view-${viewId === 'alertes' ? 'annonces' : viewId}`).classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.nav-item[onclick*="${viewId}"]`);
        if(tab) tab.classList.add('active');
        this.render();
    },

    setFilter(f) {
        this.state.filter = f;
        document.querySelectorAll('.pill').forEach(p => {
            p.classList.remove('active');
            if(p.innerText.toLowerCase().includes(f.toLowerCase())) p.classList.add('active');
        });
        if (f === 'all') document.querySelector('.pill:first-child').classList.add('active');
        this.render();
    },

    getRelativeTime(dateIso) {
        const diff = Math.floor((new Date() - new Date(dateIso)) / 1000 / 60);
        if (diff < 1) return "À l'instant";
        if (diff < 60) return `Il y a ${diff} min`;
        const h = Math.floor(diff / 60);
        if (h < 24) return `Il y a ${h} h`;
        return new Date(dateIso).toLocaleDateString();
    },

    render() {
        const wall = document.getElementById('login-wall');
        const main = document.getElementById('main-ui');
        
        if (!this.state.token) {
            wall.style.display = 'flex';
            main.style.display = 'none';
            document.getElementById('btn-auth').href = this.getAuthUrl();
        } else {
            wall.style.display = 'none';
            main.style.display = 'block';
        }

        // Stats Header
        document.getElementById('stat-listings').innerText = this.state.listings.length;
        document.getElementById('alert-count').innerText = this.state.listings.filter(l => this.getRelativeTime(l.date).includes('min')).length;
        document.getElementById('notif-badge').innerText = this.state.listings.length;

        // List Grid
        const list = document.getElementById('alerts-list');
        if (list) {
            let filtered = this.state.listings;
            if (this.state.filter !== 'all') filtered = filtered.filter(l => l.type === this.state.filter);
            if (this.state.activeView === 'favoris') filtered = filtered.filter(l => this.state.favorites.includes(l.id));

            if (this.state.isSyncing && this.state.listings.length === 0) {
                list.innerHTML = `<div class="loader-container"><h3>Radar en cours...</h3></div>`;
            } else {
                list.innerHTML = filtered.map(item => this.createCard(item)).join('');
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    createCard(item) {
        const isFav = this.state.favorites.includes(item.id);
        const icon = item.type === 'Maison' ? 'home' : 'building-2';
        const statusClass = item.status === 'Nouveau' ? 'badge-new' : (item.status === 'Exclusif' ? 'badge-excl' : '');
        
        return `
            <div class="property-card-target">
                <div class="img-placeholder"><i data-lucide="${icon}"></i></div>
                <div class="card-info">
                    <div class="card-header">
                        <span class="card-type">${item.type} · ${item.rooms}P</span>
                        <span class="badge-tag ${statusClass}">${item.status}</span>
                    </div>
                    <div class="card-subtitle">${item.surface} m² · ${item.city}</div>
                    <div class="card-price-target">${item.price.toLocaleString()} €</div>
                </div>
                <div class="card-heart" onclick="app.toggleFav('${item.id}')">
                    <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : '#FFF'}"></i>
                </div>
                <div class="card-time">${this.getRelativeTime(item.date)}</div>
                <a href="${item.url}" target="_blank" style="position:absolute; inset:0; z-index:1;"></a>
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
