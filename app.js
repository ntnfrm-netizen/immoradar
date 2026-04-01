/**
 * IMMORADAR - Mobile App Logic
 * Designed for Marie-Astrid
 */

const app = {
    // Current state
    state: {
        activeView: 'alerts',
        listings: [],
        favorites: JSON.parse(localStorage.getItem('immo_favorites') || '[]'),
        manualAdditions: JSON.parse(localStorage.getItem('immo_manual') || '[]'),
        targetCities: [
            'Sceaux', 'Bourg-la-Reine', 'Antony', 
            'Châtenay-Malabry', 'Le Plessis-Robinson', 
            'Fontenay-aux-Roses', 'Clamart'
        ],
        tourDaysFilter: 7
    },

    init() {
        console.log('ImmoRadar Initializing...');
        this.bindEvents();
        this.loadDemoData();
        this.render();
    },

    bindEvents() {
        const addForm = document.getElementById('add-form');
        if (addForm) {
            addForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleManualAdd();
            });
        }
    },

    // --- Navigation ---
    switchView(viewId) {
        // Update DOM
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(`view-${viewId}`).classList.remove('hidden');
        
        // Update Tab Bar
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
            if (item.getAttribute('onclick').includes(viewId)) {
                item.classList.add('active');
            }
        });

        // Update Title
        const titles = {
            'alerts': 'Alertes SeLoger',
            'map': 'Carte Immobilière',
            'tour': 'Ma Tournée',
            'favorites': 'Mes Favoris'
        };
        document.getElementById('view-title').textContent = titles[viewId] || 'ImmoRadar';
        
        this.state.activeView = viewId;
        this.render();
    },

    openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    },

    // --- Data Management ---
    loadDemoData() {
        // Simulation of data extracted from Gmail
        const demoListings = [
            {
                id: 'sl-1',
                source: 'SeLoger',
                city: 'Sceaux',
                price: 845000,
                surface: 92,
                rooms: 4,
                url: 'https://www.seloger.com/annonces/achat/maison/sceaux-92/12345.htm',
                date: new Date().toISOString(),
                img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80'
            },
            {
                id: 'sl-2',
                source: 'SeLoger',
                city: 'Antony',
                price: 420000,
                surface: 45,
                rooms: 2,
                url: 'https://www.seloger.com/annonces/achat/appartement/antony-92/67890.htm',
                date: new Date(Date.now() - 86400000 * 2).toISOString(), // 2 days ago
                img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?auto=format&fit=crop&w=800&q=80'
            },
            {
                id: 'sl-3',
                source: 'SeLoger',
                city: 'Bourg-la-Reine',
                price: 590000,
                surface: 68,
                rooms: 3,
                url: 'https://www.seloger.com/annonces/achat/appartement/bourg-la-reine-92/11223.htm',
                date: new Date(Date.now() - 86400000 * 5).toISOString(), // 5 days ago
                img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80'
            }
        ];

        this.state.listings = [...demoListings, ...this.state.manualAdditions];
    },

    refreshData() {
        // Here we would trigger the Gmail API call
        console.log('Checking for new alerts in Gmail...');
        const btn = document.querySelector('.icon-btn i');
        btn.classList.add('animate-spin'); // Optional: would need CSS animation
        
        setTimeout(() => {
            alert("Vérification terminée. Aucune nouvelle alerte pour Marie-Astrid.");
        }, 1500);
    },

    handleManualAdd(event) {
        if (event) event.preventDefault();
        const city = document.getElementById('add-city').value;
        const price = document.getElementById('add-price').value;
        const surface = document.getElementById('add-surface').value;
        const url = document.getElementById('add-url').value;

        if (!city || !price || !surface) return alert("Veuillez remplir les champs obligatoires.");

        const newEntry = {
            id: 'manual-' + Date.now(),
            source: 'Manuel',
            city,
            price: parseInt(price),
            surface: parseInt(surface),
            rooms: '?',
            url: url || '#',
            date: new Date().toISOString(),
            img: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=800&q=80'
        };

        this.state.manualAdditions.unshift(newEntry);
        localStorage.setItem('immo_manual', JSON.stringify(this.state.manualAdditions));
        this.state.listings.unshift(newEntry);
        
        this.closeModal('add-modal');
        document.getElementById('add-form').reset();
        this.render();
    },

    parseEmail() {
        const content = document.getElementById('email-content').value;
        if (!content) return alert("Veuillez coller le contenu du mail.");

        // Simple Regex extraction
        const priceMatch = content.match(/([0-9\s]+)[€|EUR]/i);
        const surfaceMatch = content.match(/([0-9\s,]+)[m²|m2]/i);
        
        // Find city among targets
        let foundCity = "Sceaux"; // Default
        for(let city of this.state.targetCities) {
            if (content.toLowerCase().includes(city.toLowerCase())) {
                foundCity = city;
                break;
            }
        }

        const price = priceMatch ? parseInt(priceMatch[1].replace(/\s/g, '')) : 500000;
        const surface = surfaceMatch ? parseInt(surfaceMatch[1].replace(/\s/g, '').replace(',', '.')) : 50;

        const newEntry = {
            id: 'email-' + Date.now(),
            source: 'SeLoger (Auto)',
            city: foundCity,
            price: price,
            surface: surface,
            rooms: '?',
            url: 'https://www.seloger.com',
            date: new Date().toISOString(),
            img: 'https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80'
        };

        this.state.listings.unshift(newEntry);
        this.closeModal('import-modal');
        document.getElementById('email-content').value = '';
        this.render();
        alert(`Annonce détectée : ${foundCity}, ${price}€, ${surface}m². Ajoutée aux alertes !`);
    },

    toggleFavorite(id) {
        const index = this.state.favorites.indexOf(id);
        if (index > -1) {
            this.state.favorites.splice(index, 1);
        } else {
            this.state.favorites.push(id);
        }
        localStorage.setItem('immo_favorites', JSON.stringify(this.state.favorites));
        this.render();
    },

    // --- Rendering ---
    render() {
        if (this.state.activeView === 'alerts') this.renderAlerts();
        if (this.state.activeView === 'favorites') this.renderFavorites();
        if (this.state.activeView === 'tour') this.renderTour();
        
        // Refresh icons
        if (window.lucide) lucide.createIcons();
    },

    renderAlerts() {
        const container = document.getElementById('alerts-list');
        if (!container) return;
        
        container.innerHTML = this.state.listings.map(item => this.createCardHTML(item)).join('');
    },

    renderFavorites() {
        const container = document.getElementById('favorites-list');
        if (!container) return;

        const favs = this.state.listings.filter(l => this.state.favorites.includes(l.id));
        
        if (favs.length === 0) {
            container.innerHTML = `<div class="empty-state"><i data-lucide="heart" size="48"></i><p>Aucun favori.</p></div>`;
        } else {
            container.innerHTML = favs.map(item => this.createCardHTML(item)).join('');
        }
    },

    renderTour() {
        const container = document.getElementById('tour-list');
        if (!container) return;

        // Filter by date
        const threshold = Date.now() - (this.state.tourDaysFilter * 86400000);
        const tourItems = this.state.listings.filter(l => new Date(l.date).getTime() > threshold);

        if (tourItems.length === 0) {
            container.innerHTML = `<p class="empty-state">Aucun bien récent pour cette période.</p>`;
        } else {
            container.innerHTML = tourItems.map((item, i) => `
                <div class="tour-stop">
                    <div class="stop-number">${i + 1}</div>
                    <div class="stop-info">
                        <h3>${item.city} - ${item.surface}m²</h3>
                        <p>${item.price.toLocaleString()}€</p>
                    </div>
                </div>
            `).join('');
        }
    },

    setTourFilter(days) {
        this.state.tourDaysFilter = days;
        document.querySelectorAll('.tour-config .chip').forEach(c => {
            c.classList.remove('active');
            if (c.textContent.includes(days === 7 ? '7 jours' : days === 14 ? '2 semaines' : '1 mois')) {
                c.classList.add('active');
            }
        });
        this.renderTour();
    },

    generateRoute() {
        const threshold = Date.now() - (this.state.tourDaysFilter * 86400000);
        const tourItems = this.state.listings.filter(l => new Date(l.date).getTime() > threshold);
        
        if (tourItems.length === 0) return alert("Rien à visiter !");

        // Format for Google Maps: https://www.google.com/maps/dir/Origin/Stop1/Stop2/Dest
        const base = "https://www.google.com/maps/dir/";
        const stops = tourItems.map(item => encodeURIComponent(`${item.city}, France`)).join('/');
        
        window.open(base + stops, '_blank');
    },

    createCardHTML(item) {
        const isFav = this.state.favorites.includes(item.id);
        const dateStr = new Date(item.date).toLocaleDateString();
        
        return `
            <div class="card">
                <div class="card-img-container">
                    <img src="${item.img}" class="card-img" alt="Property">
                    <span class="card-badge">${item.city}</span>
                </div>
                <div class="card-content">
                    <div class="card-price">${item.price.toLocaleString()} €</div>
                    <div class="card-info">
                        <span>${item.surface} m² | ${item.rooms} pièces</span>
                        <span>${dateStr}</span>
                    </div>
                    <div class="card-actions">
                        <a href="${item.url}" target="_blank" class="primary-btn" style="flex:1; text-decoration:none; justify-content:center;">
                            Voir l'annonce
                        </a>
                        <button class="secondary-btn" onclick="app.toggleFavorite('${item.id}')">
                            <i data-lucide="heart" ${isFav ? 'fill="#C5A021"' : ''} style="color: ${isFav ? '#C5A021' : 'inherit'}"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
};

// Start app
document.addEventListener('DOMContentLoaded', () => app.init());
