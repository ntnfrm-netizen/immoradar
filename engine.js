/**
 * IMMORADAR - Mobile App Logic
 * Version 3.2.0 - TOTAL VISION BUILD
 * Fixed: Diagnostic reporting, Geolocation extraction, Itineraries
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
        isSyncing: false,
        diagnostic: ""
    },

    init() {
        console.log("[IMMORADAR] v3.2.0 Total Vision");
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
     * SYNC TOTAL VISION v3.2.0
     * Diagnostic: Lists subjects found to verify Gmail visibility
     */
    async sync() {
        if (!this.state.token || this.state.isSyncing) return;
        this.state.isSyncing = true;
        this.state.diagnostic = "Radar en cours d'initialisation...";
        this.render();

        try {
            // Broad search for diagnosis
            const query = encodeURIComponent('SeLoger'); 
            const listResp = await fetch(`https://gmail.googleapis.com/v1/users/me/messages?q=${query}&maxResults=30`, {
                headers: { 'Authorization': `Bearer ${this.state.token}` }
            });
            
            if (!listResp.ok) throw new Error("Expired");
            const listData = await listResp.json();
            const messages = listData.messages || [];

            if (messages.length === 0) {
                this.state.diagnostic = "Aucun mail 'SeLoger' trouvé dans votre boîte Gmail.";
                this.state.isSyncing = false;
                this.render();
                return;
            }

            // Diagnostic Step: Fetch subjects
            const diagResults = await Promise.all(
                messages.slice(0, 5).map(msg => 
                    fetch(`https://gmail.googleapis.com/v1/users/me/messages/${msg.id}?fields=payload/headers`, {
                        headers: { 'Authorization': `Bearer ${this.state.token}` }
                    }).then(r => r.json())
                )
            );

            const subjects = diagResults.map(res => {
                const h = res.payload.headers.find(h => h.name === 'Subject');
                return h ? h.value : 'Sans sujet';
            });

            this.state.diagnostic = `Mails détectés : ${subjects.join(' | ')}`;
            this.render();

            // Actual Deep Fetch
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
                this.state.diagnostic = "";
            } else {
                this.state.diagnostic = `Diagnostic : ${messages.length} mails trouvés, mais formats non reconnus.`;
            }
        } catch (e) {
            this.state.diagnostic = "Erreur de connexion Gmail.";
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
        
        // PRIX (Robust Capture)
        const pMatch = clean.match(/([0-9]{1,3}[ \t\u00A0]*[0-9]{3}[ \t\u00A0]*[0-9]{3}|[0-9]{1,3}[ \t\u00A0]*[0-9]{3}|[0-9]{4,10})[ \t\u00A0]*(?:€|EUR)/i);
        if (!pMatch) return null;
        const price = parseInt(pMatch[1].replace(/[\s\t\u00A0]/g, ''));

        // SURFACE (Check for , or .)
        let surfaceMatch = clean.match(/([0-9]+(?:[.,][0-9]+)?)[ \t\u00A0]*(?:m²|m2)/i);
        let surface = surfaceMatch ? Math.round(parseFloat(surfaceMatch[1].replace(',', '.'))) : 0;
        
        // ADRESSE & VILLE (Detailed extraction)
        let address = "Quartier 92 Sud";
        const addrMatch = clean.match(/([a-zA-ZàéèêëîïôûùçÀÉÈÊËÎÏÔÛÙÇ\s-]{2,40}),\s*([a-zA-ZàéèêëîïôûùçÀÉÈÊËÎÏÔÛÙÇ\s-]{2,40})\s*\(([0-9]{5})\)/i);
        if (addrMatch) {
            address = `${addrMatch[1]}, ${addrMatch[2]} (${addrMatch[3]})`;
        }
        
        const cities = ['Sceaux', 'Antony', 'Bourg-la-Reine', 'Clamart', 'Châtenay-Malabry', 'Fontenay-aux-Roses'];
        let city = "92";
        for (let c of cities) if (clean.toLowerCase().includes(c.toLowerCase())) { city = c; break; }

        // TYPE & ROOMS
        let type = clean.toLowerCase().includes('maison') ? 'Maison' : 'Appartement';
        let roomsMatch = clean.match(/([0-9]+)\s*p/i);
        let rooms = roomsMatch ? roomsMatch[1] : '?';

        return { 
            id: msg.id, type, rooms, city, address, price, surface, 
            pricePerM2: surface > 0 ? Math.round(price / surface) : 0, 
            url: body.match(/https?:\/\/(?:www\.)?seloger\.com\/annonces\/[^"'\s>]+/i)?.[0] || 'https://www.seloger.com',
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

    openItinerary(dest) {
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`, '_blank');
    },

    switchView(viewId) {
        this.state.activeView = viewId;
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const target = document.getElementById(`view-${viewId === 'alertes' ? 'annonces' : viewId}`);
        if(target) target.classList.remove('hidden');
        document.querySelectorAll('.nav-item').forEach(t => t.classList.remove('active'));
        const tab = document.querySelector(`.nav-item[onclick*="${viewId}"]`);
        if(tab) tab.classList.add('active');
        this.render();
    },

    render() {
        const wall = document.getElementById('login-wall');
        const ui = document.getElementById('main-ui');
        
        if (!this.state.token) {
            wall.style.display = 'flex';
            ui.style.display = 'none';
        } else {
            wall.style.display = 'none';
            ui.style.display = 'block';
        }

        // Stats
        document.getElementById('stat-listings').innerText = this.state.listings.length;
        document.getElementById('notif-badge').innerText = this.state.listings.length;

        const list = document.getElementById('alerts-list');
        if (list) {
            let filtered = this.state.listings;
            if (this.state.filter !== 'all') filtered = filtered.filter(l => l.type === this.state.filter);
            if (this.state.activeView === 'favoris') filtered = filtered.filter(l => this.state.favorites.includes(l.id));

            if (this.state.isSyncing && this.state.listings.length === 0) {
                list.innerHTML = `<div class="loader-container"><h3>Radar en cours...</h3><p style="font-size:0.6rem; opacity:0.6; padding-top:10px;">${this.state.diagnostic}</p></div>`;
            } else if (this.state.listings.length === 0) {
                list.innerHTML = `<div class="empty-state"><h3>Rien à signaler</h3><p style="font-size:0.6rem; opacity:0.6;">${this.state.diagnostic}</p></div>`;
            } else {
                list.innerHTML = filtered.map(item => this.createCard(item)).join('');
            }
        }
        if (window.lucide) lucide.createIcons();
    },

    createCard(item) {
        const isFav = this.state.favorites.includes(item.id);
        const icon = item.type === 'Maison' ? 'home' : 'building-2';
        
        return `
            <div class="property-card-target">
                <div class="img-placeholder"><i data-lucide="${icon}"></i></div>
                <div class="card-info">
                    <div class="card-header">
                        <span class="card-type">${item.type} · ${item.rooms}P</span>
                        <span class="badge-tag badge-new">Nouveau</span>
                    </div>
                    <div class="card-subtitle" style="font-size:0.65rem; line-height:1.2;">
                        ${item.surface} m² · ${item.address}
                    </div>
                    <div class="card-price-target">${item.price.toLocaleString()} €</div>
                </div>
                <div class="card-heart" onclick="app.toggleFav('${item.id}', event)">
                    <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : '#FFF'}"></i>
                </div>
                <div class="action-buttons-overlay" style="display:flex; gap:10px; margin-top:10px;">
                    <a href="${item.url}" target="_blank" class="btn-primary-target" style="padding: 8px 15px; font-size: 0.7rem; background: var(--accent-gold);">RÉPONDRE</a>
                    <button onclick="app.openItinerary('${item.address}')" class="btn-primary-target" style="padding: 8px 15px; font-size: 0.7rem; background: #333; color: #FFF;">ITINÉRAIRE</button>
                </div>
                <div class="card-time">${this.getRelativeTime(item.date)}</div>
            </div>`;
    },

    toggleFav(id, ev) {
        ev.stopPropagation();
        const idx = this.state.favorites.indexOf(id);
        if (idx > -1) this.state.favorites.splice(idx, 1);
        else this.state.favorites.push(id);
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
