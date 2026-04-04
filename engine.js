/**
 * IMMORADAR - Mobile App Logic
 * Version 3.3.1 - RADAR VISION FIX
 * Fixed: Filter styling overlap, Broadest Gmail Query, Trace subjects
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
        tourList: [],
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        token: localStorage.getItem('immo_token_raw'),
        isSyncing: false,
        diagnostic: "Radar actif v3.3.1"
    },

    init() {
        console.log("[IMMORADAR] v3.3.1 Radar Vision");
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
     * SYNC RADAR v3.3.1
     * Target: Broader query for maximum visibility
     */
    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.state.diagnostic = "Scan Gmail en cours...";
        this.render();

        try {
            // Broader query: search any mention of seloger.com
            const query = encodeURIComponent('@seloger.com');
            const listResp = await fetch(`https://gmail.googleapis.com/v1/users/me/messages?q=${query}&maxResults=30`, {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            
            if (!listResp.ok) throw new Error("Expired");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                this.state.diagnostic = "Aucun mail @seloger.com détecté.";
                this.state.isSyncing = false;
                this.render();
                return;
            }

            // Diagnostic: Fetch subjects to see what's happening
            const diagResults = await Promise.all(
                messages.slice(0, 3).map(msg => 
                    fetch(`https://gmail.googleapis.com/v1/users/me/messages/${msg.id}?fields=payload/headers`, {
                        headers: { 'Authorization': `Bearer ${this.state.token}` }
                    }).then(r => r.json())
                )
            );
            const subjects = diagResults.map(res => res.payload.headers.find(h => h.name === 'Subject')?.value || 'Sans sujet');
            this.state.diagnostic = `Trouvé : ${subjects.join(', ')}`;
            this.render();

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
                this.state.diagnostic = "";
            } else {
                this.state.diagnostic = `Mails trouvés mais parsing échoué. Problème de format.`;
            }
        } catch (e) {
            this.state.diagnostic = "Erreur de connexion.";
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

        let surfaceMatch = clean.match(/([0-9]+(?:[.,][0-9]+)?)[ \t\u00A0]*(?:m²|m2)/i);
        let surface = surfaceMatch ? Math.round(parseFloat(surfaceMatch[1].replace(',', '.'))) : 0;
        
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay', 'Fontenay'];
        let city = "92 Sud";
        for (let c of cities) if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }

        let type = clean.toLowerCase().includes('maison') ? 'Maison' : 'Appartement';
        let rooms = (clean.match(/([0-9]+)\s*p/i) || clean.match(/([0-9]+)\s*pi/i))?.[1] || '?';

        return { 
            id: msg.id, type, rooms, city, price, surface, 
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

    switchView(viewId) {
        this.state.activeView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId === 'alertes' ? 'annonces' : viewId}`)?.classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        document.querySelector(`.nav-item[onclick*="${viewId}"]`)?.classList.add('active');
        this.render();
    },

    setFilter(f) {
        this.state.filter = f;
        this.render();
    },

    render() {
        const wall = document.getElementById('login-wall');
        const ui = document.getElementById('main-ui');
        if (!this.state.token) { wall.style.display = 'flex'; ui.style.display = 'none'; }
        else { wall.style.display = 'none'; ui.style.display = 'block'; }

        document.getElementById('stat-listings').innerText = this.state.listings.length;
        document.getElementById('notif-badge').innerText = this.state.listings.length;

        // Diagnostic Text update
        const diag = document.getElementById('diagnostic-text');
        if (diag) diag.innerText = this.state.diagnostic;

        const list = document.getElementById('alerts-list');
        if (list) {
            let filtered = this.state.listings;
            if (this.state.filter !== 'all') filtered = filtered.filter(l => l.type.includes(this.state.filter));
            if (this.state.activeView === 'favoris') filtered = filtered.filter(l => this.state.favorites.includes(l.id));

            if (this.state.isSyncing && this.state.listings.length === 0) list.innerHTML = `<div class="loader-container"><h3>Radar v3.3.1...</h3><p style="font-size:0.6rem; margin-top:10px;">${this.state.diagnostic}</p></div>`;
            else list.innerHTML = filtered.length ? filtered.map(item => this.createCard(item)).join('') : `<div class="empty-state"><h3>Rien à signaler</h3><p style="font-size:0.6rem;">${this.state.diagnostic}</p></div>`;
        }
        if (window.lucide) lucide.createIcons();
    },

    createCard(item) {
        const isFav = this.state.favorites.includes(item.id);
        return `
            <div class="property-card-target">
                <div class="card-header">
                    <span class="card-type">${item.type} · ${item.rooms}P</span>
                    <span class="badge-tag">Nouveau</span>
                </div>
                <div class="card-subtitle">${item.surface} m² · ${item.city}</div>
                <div class="card-price-target">${item.price.toLocaleString()} €</div>
                <div class="card-heart" onclick="app.toggleFav('${item.id}', event)">
                    <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : '#FFF'}"></i>
                </div>
                <a href="${item.url}" target="_blank" style="position:absolute; inset:0; z-index:1;"></a>
            </div>`;
    },

    toggleFav(id, ev) { ev.stopPropagation(); const idx = this.state.favorites.indexOf(id); if (idx > -1) this.state.favorites.splice(idx, 1); else this.state.favorites.push(id); localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites)); this.render(); }
};

document.addEventListener('DOMContentLoaded', () => app.init());
