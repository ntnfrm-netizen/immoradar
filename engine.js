/**
 * IMMORADAR - Mobile App Logic
 * Version 3.3.0 - TOTAL RESTORATION BUILD
 * Features: Interactive Leaflet Map, Tour Multi-Stop, Force Sync
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
        tourList: [], // List of IDs to visit
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        token: localStorage.getItem('immo_token_raw'),
        isSyncing: false,
        map: null,
        markers: []
    },

    init() {
        console.log("[IMMORADAR] v3.3.0 Restoration");
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
     * SYNC FORCE BRUTE v3.3.0
     * Target: ANY mail containing SeLoger
     */
    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.render();

        try {
            const query = encodeURIComponent('SeLoger');
            const listResp = await fetch(`https://gmail.googleapis.com/v1/users/me/messages?q=${query}&maxResults=30`, {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            
            if (!listResp.ok) throw new Error("Expired");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                document.getElementById('diagnostic-text').innerText = "Zéro mail SeLoger reçu ces derniers jours.";
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
                this.state.listings = newListings.sort((a,b) => new Date(b.date) - new Date(a.date));
                localStorage.setItem('immo_cache', JSON.stringify(this.state.listings));
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
        
        const pMatch = clean.match(/([0-9]{1,3}[ \t\u00A0]*[0-9]{3}[ \t\u00A0]*[0-9]{3}|[0-9]{1,3}[ \t\u00A0]*[0-9]{3}|[0-9]{4,10})[ \t\u00A0]*(?:€|EUR)/i);
        if (!pMatch) return null;
        const price = parseInt(pMatch[1].replace(/[\s\t\u00A0]/g, ''));

        let surface = clean.match(/([0-9]+(?:[.,][0-9]+)?)[ \t\u00A0]*(?:m²|m2)/i);
        surface = surface ? Math.round(parseFloat(surface[1].replace(',', '.'))) : 0;
        
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay-Malabry', 'Fontenay-aux-Roses'];
        let city = "92 Sud";
        for (let c of cities) if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }

        let type = clean.toLowerCase().includes('maison') ? 'Maison' : 'Appartement';
        let rooms = (clean.match(/([0-9]+)\s*p/i) || clean.match(/([0-9]+)\s*pi/i))?.[1] || '?';

        // Mock Geo (for visualization)
        const coords = {
            'Sceaux': [48.778, 2.296],
            'Antony': [48.753, 2.297],
            'Bourg-la-Reine': [48.779, 2.316],
            'Clamart': [48.800, 2.263],
            'Châtenay-Malabry': [48.765, 2.261]
        };
        const base = coords[city] || [48.778, 2.296];
        const lat = base[0] + (Math.random() - 0.5) * 0.01;
        const lng = base[1] + (Math.random() - 0.5) * 0.01;

        return { 
            id: msg.id, type, rooms, city, price, surface, 
            lat, lng,
            url: body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i)?.[0] || 'https://www.seloger.com',
            date: new Date(parseInt(msg.internalDate)).toISOString() 
        };
    },

    extractBody(payload) {
        let body = "";
        if (payload.body.data) body = atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        else if (payload.parts) payload.parts.forEach(p => body += this.extractBody(p));
        return body;
    },

    /**
     * MAP v3.3.0
     */
    initMap() {
        if (this.state.map) return;
        this.state.map = L.map('map', { zoomControl: false }).setView([48.778, 2.296], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(this.state.map);
        this.updateMapMarkers();
    },

    updateMapMarkers() {
        if (!this.state.map) return;
        this.state.markers.forEach(m => this.state.map.removeLayer(m));
        this.state.markers = [];

        this.state.listings.forEach(l => {
            const m = L.marker([l.lat, l.lng]).addTo(this.state.map)
                .bindPopup(`<b>${l.type} - ${l.price.toLocaleString()} €</b><br>${l.city}`);
            this.state.markers.push(m);
        });
    },

    generateTour() {
        if (this.state.tourList.length === 0) return alert("Sélectionnez au moins un bien (bouton +) pour la tournée.");
        const targets = this.state.listings.filter(l => this.state.tourList.includes(l.id));
        const dests = targets.map(l => `${l.lat},${l.lng}`).join('/');
        window.open(`https://www.google.com/maps/dir/${dests}`, '_blank');
    },

    toggleTour(id, ev) {
        ev.stopPropagation();
        const idx = this.state.tourList.indexOf(id);
        if (idx > -1) this.state.tourList.splice(idx, 1);
        else this.state.tourList.push(id);
        this.render();
    },

    switchView(viewId) {
        this.state.activeView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const target = document.getElementById(`view-${viewId === 'alertes' ? 'annonces' : viewId}`);
        if(target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.nav-item[onclick*="${viewId}"]`);
        if(tab) tab.classList.add('active');
        
        if (viewId === 'carte') setTimeout(() => { this.initMap(); this.state.map.invalidateSize(); }, 300);
        this.render();
    },

    render() {
        const wall = document.getElementById('login-wall');
        const ui = document.getElementById('main-ui');
        if (!this.state.token) { wall.style.display = 'flex'; ui.style.display = 'none'; document.getElementById('btn-auth').href = this.getAuthUrl(); }
        else { wall.style.display = 'none'; ui.style.display = 'block'; }

        document.getElementById('stat-listings').innerText = this.state.listings.length;
        document.getElementById('notif-badge').innerText = this.state.listings.length;
        document.getElementById('tour-count').innerText = this.state.tourList.length;

        const list = document.getElementById('alerts-list');
        if (list) {
            let filtered = this.state.listings;
            if (this.state.filter !== 'all') filtered = filtered.filter(l => l.type === this.state.filter);
            if (this.state.activeView === 'favoris') filtered = filtered.filter(l => this.state.favorites.includes(l.id));

            if (this.state.isSyncing && this.state.listings.length === 0) list.innerHTML = `<div class="loader-container"><h3>Radar v3.3.0...</h3></div>`;
            else list.innerHTML = filtered.map(item => this.createCard(item)).join('');
        }
        if (window.lucide) lucide.createIcons();
    },

    createCard(item) {
        const inTour = this.state.tourList.includes(item.id);
        const icon = item.type === 'Maison' ? 'home' : 'building-2';
        return `
            <div class="property-card-target">
                <div class="card-header">
                    <span class="card-type">${item.type} · ${item.rooms}P</span>
                    <span class="badge-tag">Nouveau</span>
                </div>
                <div class="card-subtitle">${item.surface} m² · ${item.city}</div>
                <div class="card-price-target">${item.price.toLocaleString()} €</div>
                <div class="card-actions-v3">
                    <a href="${item.url}" target="_blank" class="btn-target btn-gold">DÉTAILS</a>
                    <button onclick="app.toggleTour('${item.id}', event)" class="btn-target ${inTour ? 'btn-gold' : 'btn-dark'}">
                        ${inTour ? 'DANS TOURNÉE ✓' : '+ TOURNÉE'}
                    </button>
                </div>
                <div class="card-heart" onclick="app.toggleFav('${item.id}', event)">
                    <i data-lucide="heart" ${this.state.favorites.includes(item.id) ? 'fill="#C5A021"' : ''} style="color: ${this.state.favorites.includes(item.id) ? '#C5A021' : '#FFF'}"></i>
                </div>
            </div>`;
    },

    setFilter(f) { this.state.filter = f; this.render(); },
    toggleFav(id, ev) { ev.stopPropagation(); const idx = this.state.favorites.indexOf(id); if (idx > -1) this.state.favorites.splice(idx, 1); else this.state.favorites.push(id); localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites)); this.render(); }
};

document.addEventListener('DOMContentLoaded', () => app.init());
