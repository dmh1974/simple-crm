

class SimpleCRM {
    constructor() {
        this.venues = [];
        this.filteredVenues = [];
        this.headers = [];
        this.currentEditIndex = -1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.hiddenColumns = new Set();
        this.map = null;
        this.markers = [];
        this.geoData = {};
        this.mapReady = false;
        
        // Pagination properties
        this.currentPage = 1;
        this.pageSize = 50;
        this.totalPages = 1;
        
        // Performance optimization - cache column widths
        this.columnWidthsCache = null;
        this.lastColumnCalculationHash = null;
        
        // Filter properties
        this.statusFilters = [];
        this.regionFilters = [];
        this.typeFilters = [];
        this.minVenueCount = 1; // Default minimum venue count for map
        
        // Map position properties
        this.mapCenter = [43.2994, -74.2179]; // Default center (New York State)
        this.mapZoom = 7; // Default zoom level
        
        // History tracking properties
        this.history = [];
        this.historyPageSize = 5;
        this.historyCurrentPage = 1;
        this.historyTotalPages = 1;
        this.historySearchFilter = '';
        
        // Location search properties
        this.currentSearchResults = null;
        this.selectedResultIndex = -1;
        
        this.loadGeoData();
        this.loadFromLocalStorage();
        this.initializeMap();
        this.initializeEventListeners();
        
        // Initialize debounced search
        this.debouncedSearch = this.debounce((searchTerm) => {
            this.applyFilters();
        }, 300);
        
        // Initialize debounced history search
        this.debouncedHistorySearch = this.debounce((searchTerm) => {
            this.applyHistoryFilters();
        }, 300);
    }



    switchEditTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.edit-tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.edit-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    initializeEventListeners() {
        // Import/Export modal button
        document.getElementById('importDataBtn').addEventListener('click', () => this.openImportModal());
        
        // Import/Export buttons (now in modal)
        document.getElementById('importBtn').addEventListener('click', () => this.importData());
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        
        // File upload functionality
        document.getElementById('fileUpload').addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Filter controls
        document.getElementById('statusFilterBtn').addEventListener('click', () => this.openFilterModal('status'));
        document.getElementById('regionFilterBtn').addEventListener('click', () => this.openFilterModal('region'));
        document.getElementById('typeFilterBtn').addEventListener('click', () => this.openFilterModal('type'));
        document.getElementById('searchFilter').addEventListener('input', (e) => this.debouncedSearch(e.target.value));
        
        // Map venue count filter
        document.getElementById('minVenueFilter').addEventListener('input', (e) => {
            const minCount = parseInt(e.target.value) || 1;
            this.minVenueCount = minCount;
            this.updateMap();
            this.saveToLocalStorage(); // Save the setting immediately
        });
        
        // Reset location button
        document.getElementById('resetLocationBtn').addEventListener('click', () => this.resetMapLocation());
        
        // Location search
        document.getElementById('locationSearch').addEventListener('input', (e) => this.handleLocationSearch(e.target.value));
        document.getElementById('locationSearch').addEventListener('keydown', (e) => this.handleLocationSearchKeydown(e));
        document.getElementById('locationSearch').addEventListener('blur', (e) => {
            // Hide results after a short delay to allow clicking on results
            // But don't hide if the user is clicking on a search result
            setTimeout(() => {
                if (!e.relatedTarget || !e.relatedTarget.classList.contains('location-search-result')) {
                    this.hideLocationSearchResults();
                }
            }, 150);
        });
        document.getElementById('locationSearch').addEventListener('focus', (e) => {
            // Show results if there's text in the input
            if (e.target.value.trim()) {
                this.handleLocationSearch(e.target.value);
            }
        });
        
        // Clear all filters button
        document.getElementById('clearAllFiltersBtn').addEventListener('click', () => this.clearAllFilters());
        
        // Table controls
        document.getElementById('addRowBtn').addEventListener('click', () => this.addNewRow());
        document.getElementById('toggleColumnsBtn').addEventListener('click', () => this.showColumnToggleModal());
        document.getElementById('resetLayoutBtn').addEventListener('click', () => this.resetTableLayout());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
        
        // Edit modal controls
        document.getElementById('editModal').addEventListener('click', (e) => {
            if (e.target.id === 'editModal') {
                this.closeModal();
            }
        });
        
        document.querySelector('#editModal .close').addEventListener('click', () => this.closeModal());
        document.getElementById('saveBtn').addEventListener('click', () => this.saveEdit());
        document.getElementById('cancelBtn').addEventListener('click', () => this.closeModal());

        // Add Escape key listener for edit modal
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && document.getElementById('editModal').style.display === 'block') {
                this.closeModal();
            }
        });
        
        // Edit venue tab functionality
        document.querySelectorAll('.edit-tab-btn').forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchEditTab(tabName);
            });
        });

        // Import modal controls
        document.getElementById('importModal').addEventListener('click', (e) => {
            if (e.target.id === 'importModal') {
                this.closeImportModal();
            }
        });
        
        document.querySelector('#importModal .close').addEventListener('click', () => this.closeImportModal());

        // Column management buttons are now in HTML
        
        // Initialize tab functionality
        this.initializeImportTabs();
        
        // Initialize filter modals
        this.initializeFilterModals();
        
        // Initialize kanban board
        this.updateKanbanBoard();
        
        // Initialize history event listeners
        this.initializeHistoryEventListeners();
    }


    initializeMap() {
        // Initialize the map with saved position or default to New York State
        this.map = L.map('venueMap').setView(this.mapCenter, this.mapZoom);
        
        // Add OpenStreetMap tiles
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
        
        // Mark map as ready and trigger initial update if data exists
        this.mapReady = true;
        
        // Add event listeners to track map position changes
        this.map.on('moveend', () => {
            this.mapCenter = this.map.getCenter();
            this.mapZoom = this.map.getZoom();
            this.saveToLocalStorage();
        });
        
        // Map will be updated after localStorage data is loaded
        // Don't update here to avoid using default minVenueCount value
    }

    updateMap() {
        // Check if map is initialized and ready
        if (!this.map || !this.mapReady) {
            console.warn('Map not initialized yet, skipping update');
            return;
        }
        
        // Clear existing markers
        this.markers.forEach(marker => this.map.removeLayer(marker));
        this.markers = [];
        
        if (this.filteredVenues.length === 0) return;
        
        // Group venues by city and state
        const locationGroups = {};
        const notFoundLocations = [];
        
        this.filteredVenues.forEach(venue => {
            const city = venue.City || '';
            const state = venue.State || '';
            const key = `${city}, ${state}`.trim();
            
            if (key && key !== ',') {
                if (!locationGroups[key]) {
                    locationGroups[key] = {
                        venues: [],
                        city: city,
                        state: state
                    };
                }
                locationGroups[key].venues.push(venue);
            }
        });
        
        // Filter locations by minimum venue count
        const filteredLocationGroups = {};
        Object.entries(locationGroups).forEach(([key, data]) => {
            if (data.venues.length >= this.minVenueCount) {
                filteredLocationGroups[key] = data;
            }
        });
        
        // Create markers for each filtered location and track not found
        Object.entries(filteredLocationGroups).forEach(([key, data]) => {
            const coordinates = this.geocodeLocation(key);
            if (coordinates) {
                this.createLocationMarker(key, data);
            } else {
                notFoundLocations.push({
                    location: key,
                    expanded: this.expandStateAbbreviations(key),
                    venueCount: data.venues.length,
                    venues: data.venues.map(v => v.Venue || 'Unknown Venue').slice(0, 3) // Show first 3 venue names
                });
            }
        });
        
        // Log detailed not-found locations
        if (notFoundLocations.length > 0) {
            console.log(`\n❌ ${notFoundLocations.length} locations not found in geo data:`);
            notFoundLocations.forEach((item, index) => {
                console.log(`${index + 1}. ${item.location}`);
            });
        }
        
        console.log(`❌ Failed to geocode ${notFoundLocations.length} locations`);
        
        // Don't auto-fit map bounds - preserve current view
        // Only fit bounds if this is the initial load and no markers exist yet
        if (this.markers.length === 0 && Object.keys(locationGroups).length > 0) {
        setTimeout(() => {
            if (this.markers.length > 0) {
                const group = new L.featureGroup(this.markers);
                this.map.fitBounds(group.getBounds().pad(0.1));
            }
        }, 100);
        }
    }

    createLocationMarker(locationKey, data) {
        try {
            // Geocode the location
            const coordinates = this.geocodeLocation(locationKey);
            
            if (coordinates && coordinates.length === 2 && !isNaN(coordinates[0]) && !isNaN(coordinates[1])) {
                const count = data.venues.length;
                const venueNames = data.venues.map(v => v.Venue || 'Unknown Venue').filter(Boolean);
                
                // Create custom marker with count
                const marker = L.circleMarker(coordinates, {
                    radius: Math.max(15, Math.min(30, 10 + count * 2)), // Size based on count
                    fillColor: '#667eea',
                    color: '#fff',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                
                // Add count label
                const countLabel = L.divIcon({
                    className: 'venue-count-label',
                    html: `<div style="
                        background: white; 
                        border-radius: 50%; 
                        width: 24px; 
                        height: 24px; 
                        display: flex; 
                        align-items: center; 
                        justify-content: center; 
                        font-weight: bold; 
                        color: #667eea;
                        font-size: 12px;
                        border: 2px solid #667eea;
                    ">${count}</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 12]
                });
                
                const labelMarker = L.marker(coordinates, { icon: countLabel });
                
                // Create popup content with edit/delete buttons for each venue
                const popupContent = `
                    <div class="venue-popup">
                        <h4>${data.city}, ${data.state}</h4>
                        <p class="venue-count">${count} venue${count > 1 ? 's' : ''}</p>
                        <div class="popup-venue-list ${count > 5 ? 'scrollable' : ''}">
                        <ul style="text-align: left; margin: 5px 0; padding-left: 20px;">
                                ${data.venues.map((venue, venueIndex) => {
                                    const venueName = venue.Venue || 'Unknown Venue';
                                    const venueType = venue.Type || '';
                                    const globalIndex = this.venues.findIndex(v => v === venue);
                                    return `
                                        <li class="popup-venue-item">
                                            <div class="popup-venue-info">
                                                <span class="venue-name">${venueName}</span>
                                                ${venueType ? `<span class="venue-type">${venueType}</span>` : ''}
                                            </div>
                                            <div class="popup-actions">
                                                <button class="popup-edit-btn" data-venue-index="${globalIndex}" title="Edit">
                                                    <i class="fas fa-edit"></i>
                                                </button>
                                                <button class="popup-copy-btn" data-venue-index="${globalIndex}" title="Copy">
                                                    <i class="fas fa-copy"></i>
                                                </button>
                                                <button class="popup-delete-btn" data-venue-index="${globalIndex}" title="Delete">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                                ${(!venue.Status || venue.Status.trim() === '') ? `
                                                <button class="popup-kanban-btn" data-venue-index="${globalIndex}" title="Add to Kanban (CANVAS)">
                                                    <i class="fas fa-tasks"></i>
                                                </button>
                                                ` : ''}
                                            </div>
                                        </li>
                                    `;
                                }).join('')}
                        </ul>
                        </div>
                    </div>
                `;
                
                marker.bindPopup(popupContent);
                labelMarker.bindPopup(popupContent);
                
                // Add event listeners for popup buttons after popup is opened
                marker.on('popupopen', (e) => {
                    this.addPopupEventListeners(e.popup, data.venues);
                });
                
                labelMarker.on('popupopen', (e) => {
                    this.addPopupEventListeners(e.popup, data.venues);
                });
                
                // Add markers to map
                marker.addTo(this.map);
                labelMarker.addTo(this.map);
                
                this.markers.push(marker, labelMarker);
            } else {
                console.warn(`Could not geocode location: ${locationKey} - No valid coordinates found`);
            }
        } catch (error) {
            console.warn(`Error creating marker for location: ${locationKey}`, error);
        }
    }

    loadGeoData() {
        try {
            // Parse the geo.js string data
            const geoString = geoDataString; // This will be defined in geo.js
            
            // Split by lines and parse
            const lines = geoString.split('\n');
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const values = line.split(',');
                    if (values.length >= 5) {
                        const country = values[0];
                        const state = values[1];
                        const name = values[2];
                        const lat = parseFloat(values[3]);
                        const lng = parseFloat(values[4]);
                        
                        if (!isNaN(lat) && !isNaN(lng)) {
                            // Create key for US locations: "City, State"
                            if (country === 'US' && state) {
                                const key = `${name}, ${state}`;
                                this.geoData[key] = [lat, lng];
                            }
                            // Also store by just city name for broader matching
                            this.geoData[name] = [lat, lng];
                        }
                    }
                }
            }
            
        } catch (error) {
            console.warn('Could not load geo.js data:', error);
        }
    }


    geocodeLocation(location) {
        if (!location || typeof location !== 'string') {
            console.warn('Invalid location provided:', location);
            return null;
        }
        
        // Convert state abbreviations to full names
        const expandedLocation = this.expandStateAbbreviations(location);
        
        // Convert city abbreviations to full names
        const cityExpandedLocation = this.expandCityAbbreviations(expandedLocation);
        
        // Try exact match first with city-expanded location
        if (this.geoData[cityExpandedLocation]) {
            return this.geoData[cityExpandedLocation];
        }
        
        // Try exact match with state-expanded location
        if (this.geoData[expandedLocation]) {
            return this.geoData[expandedLocation];
        }
        
        // Try original location as fallback
        if (this.geoData[location]) {
            return this.geoData[location];
        }
        
        // Try city-only match (without state) - but only if city is unique
        const cityOnly = cityExpandedLocation.split(',')[0].trim();
        if (cityOnly && this.geoData[cityOnly]) {
            // Check if this city name exists in multiple states
            const cityInMultipleStates = Object.keys(this.geoData).some(key => {
                if (key === cityOnly) return false; // Skip the exact city-only match
                return key.startsWith(cityOnly + ',');
            });
            
            if (!cityInMultipleStates) {
                return this.geoData[cityOnly];
            }
        }
        
        // No fuzzy matching - exact matches only
        return null;
    }

    handleLocationSearch(searchTerm) {
        if (!searchTerm || searchTerm.length < 2) {
            this.hideLocationSearchResults();
            return;
        }
        
        const matches = this.fuzzyLocationSearch(searchTerm);
        this.showLocationSearchResults(matches);
    }

    fuzzyLocationSearch(searchTerm) {
        const matches = [];
        const searchLower = searchTerm.toLowerCase();
        
        // Search through all geo data keys
        Object.keys(this.geoData).forEach(location => {
            const locationLower = location.toLowerCase();
            
            // Only include locations that have both city and state (format: "City, State")
            if (location.includes(',') && locationLower.includes(searchLower)) {
                matches.push({
                    location: location,
                    coordinates: this.geoData[location]
                });
            }
        });
        
        // Sort by relevance (exact matches first, then by length)
        matches.sort((a, b) => {
            const aExact = a.location.toLowerCase().startsWith(searchLower);
            const bExact = b.location.toLowerCase().startsWith(searchLower);
            
            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            
            return a.location.length - b.location.length;
        });
        
        return matches.slice(0, 8); // Limit to 8 matches for dropdown
    }

    showLocationSearchResults(matches) {
        const resultsContainer = document.getElementById('locationSearchResults');
        
        if (matches.length === 0) {
            this.hideLocationSearchResults();
            return;
        }
        
        resultsContainer.innerHTML = '';
        
        matches.forEach((match, index) => {
            const resultElement = document.createElement('div');
            resultElement.className = 'location-search-result';
            resultElement.textContent = match.location;
            resultElement.dataset.coordinates = JSON.stringify(match.coordinates);
            resultElement.dataset.location = match.location;
            
            resultElement.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent input blur
            });
            
            resultElement.addEventListener('click', () => {
                this.selectLocation(match.location, match.coordinates);
            });
            
            resultsContainer.appendChild(resultElement);
        });
        
        resultsContainer.style.display = 'block';
        this.currentSearchResults = matches;
        this.selectedResultIndex = -1;
    }

    hideLocationSearchResults() {
        const resultsContainer = document.getElementById('locationSearchResults');
        resultsContainer.style.display = 'none';
        resultsContainer.innerHTML = '';
        this.currentSearchResults = null;
        this.selectedResultIndex = -1;
    }

    handleLocationSearchKeydown(e) {
        if (!this.currentSearchResults) return;
        
        const results = document.querySelectorAll('.location-search-result');
        
        switch(e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedResultIndex = Math.min(this.selectedResultIndex + 1, results.length - 1);
                this.highlightSearchResult();
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.selectedResultIndex = Math.max(this.selectedResultIndex - 1, -1);
                this.highlightSearchResult();
                break;
            case 'Enter':
                e.preventDefault();
                if (this.selectedResultIndex >= 0 && this.selectedResultIndex < results.length) {
                    const selectedResult = this.currentSearchResults[this.selectedResultIndex];
                    this.selectLocation(selectedResult.location, selectedResult.coordinates);
                }
                break;
            case 'Escape':
                this.hideLocationSearchResults();
                break;
        }
    }

    highlightSearchResult() {
        const results = document.querySelectorAll('.location-search-result');
        results.forEach((result, index) => {
            if (index === this.selectedResultIndex) {
                result.classList.add('highlighted');
            } else {
                result.classList.remove('highlighted');
            }
        });
    }

    selectLocation(location, coordinates) {
        // Zoom to the selected location
        this.map.setView(coordinates, 12);
        
        // Populate the search input with the selected location and hide results
        const searchInput = document.getElementById('locationSearch');
        if (searchInput) {
            searchInput.value = location;
        }
        this.hideLocationSearchResults();
    }

    resetMapLocation() {
        // Reset to default location and zoom
        const defaultCenter = [43.2994, -74.2179]; // New York State
        const defaultZoom = 7;
        
        this.map.setView(defaultCenter, defaultZoom);
        
        // Clear the location search input
        const searchInput = document.getElementById('locationSearch');
        if (searchInput) {
            searchInput.value = '';
        }
        this.hideLocationSearchResults();
        
        // Update stored map position
        this.mapCenter = defaultCenter;
        this.mapZoom = defaultZoom;
        this.saveToLocalStorage();
    }

    expandStateAbbreviations(location) {
        const stateAbbreviations = {
            'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
            'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
            'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
            'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
            'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
            'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
            'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
            'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
            'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
            'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
            'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
            'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
            'WI': 'Wisconsin', 'WY': 'Wyoming',
            // Special cases
            'DC': 'District of Columbia'
        };
        
        // Check if location contains a state abbreviation
        for (const [abbr, fullName] of Object.entries(stateAbbreviations)) {
            if (location.includes(`, ${abbr}`)) {
                const expanded = location.replace(`, ${abbr}`, `, ${fullName}`);
                return expanded;
            }
        }
        
        return location; // Return original if no abbreviations found
    }

    expandCityAbbreviations(location) {
        // Common city abbreviation patterns
        const cityAbbreviations = {
            'St.': 'Saint',
            'St ': 'Saint ',
            'St,': 'Saint,',
            'St. ': 'Saint ',
            'St. ,': 'Saint, '
        };
        
        let expanded = location;
        
        // Check for city abbreviations
        for (const [abbr, fullName] of Object.entries(cityAbbreviations)) {
            if (expanded.includes(abbr)) {
                expanded = expanded.replace(new RegExp(abbr, 'g'), fullName);
            }
        }
        
        return expanded;
    }

    headersMatch(newHeaders, existingHeaders = this.headers) {
        if (newHeaders.length !== existingHeaders.length) {
            return false;
        }
        
        for (let i = 0; i < existingHeaders.length; i++) {
            if (newHeaders[i] !== existingHeaders[i]) {
                return false;
            }
        }
        
        return true;
    }

    isDuplicateVenue(newVenue) {
        const newVenueName = (newVenue.Venue || '').trim().toLowerCase();
        const newCity = (newVenue.City || '').trim().toLowerCase();
        const newState = (newVenue.State || '').trim().toLowerCase();
        
        // If any of the key fields are missing, don't consider it a duplicate
        if (!newVenueName || !newCity || !newState) {
            return false;
        }
        
        // Check against existing venues
        return this.venues.some(existingVenue => {
            const existingVenueName = (existingVenue.Venue || '').trim().toLowerCase();
            const existingCity = (existingVenue.City || '').trim().toLowerCase();
            const existingState = (existingVenue.State || '').trim().toLowerCase();
            
            return existingVenueName === newVenueName && 
                   existingCity === newCity && 
                   existingState === newState;
        });
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check file type
        const fileName = file.name.toLowerCase();
        if (!fileName.endsWith('.tsv') && !fileName.endsWith('.txt')) {
            alert('Please select a .tsv or .txt file.');
            return;
        }
        
        // Update file name display
        const fileNameSpan = document.getElementById('fileName');
        fileNameSpan.textContent = `Selected: ${file.name}`;
        
        // Read file content
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            // Populate the textarea with file content
            document.getElementById('spreadsheetData').value = content;
        };
        reader.onerror = () => {
            alert('Error reading file. Please try again.');
            fileNameSpan.textContent = '';
        };
        reader.readAsText(file);
    }

    importData() {
        const data = document.getElementById('spreadsheetData').value.trim();
        if (!data) {
            alert('Please paste some data or upload a file first!');
            return;
        }

        try {
            const lines = data.split('\n');
            if (lines.length < 2) {
                alert('Data must have at least a header row and one data row!');
                return;
            }

            // Parse headers
            const newHeaders = lines[0].split('\t');
            
            // Add Last Updated column if it doesn't exist
            if (!newHeaders.includes('Last Updated')) {
                newHeaders.push('Last Updated');
            }
            
            // If this is the first import, set headers
            if (this.headers.length === 0) {
                this.headers = newHeaders;
            } else {
                // Check if headers match existing data (excluding Last Updated)
                const headersWithoutLastUpdated = newHeaders.filter(h => h !== 'Last Updated');
                const existingHeadersWithoutLastUpdated = this.headers.filter(h => h !== 'Last Updated');
                if (!this.headersMatch(headersWithoutLastUpdated, existingHeadersWithoutLastUpdated)) {
                    alert('Headers must match existing data structure! Please use the same column order and names.');
                    return;
                }
            }
            
            // Parse data rows
            const newVenues = [];
            let importedCount = 0;
            let duplicateCount = 0;
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const values = line.split('\t');
                    const venue = {};
                    
                    // Ensure we have the same number of values as headers
                    for (let j = 0; j < this.headers.length; j++) {
                        venue[this.headers[j]] = values[j] || '';
                    }
                    
                    // Set Last Updated timestamp for imported venues
                    venue['Last Updated'] = new Date().toISOString();
                    
                    // Check if this venue already exists (by Venue, City, State combination)
                    if (!this.isDuplicateVenue(venue)) {
                        newVenues.push(venue);
                        importedCount++;
                    } else {
                        duplicateCount++;
                    }
                }
            }

            // Add new venues to existing data
            this.venues = [...this.venues, ...newVenues];
            this.filteredVenues = [...this.venues];
            
            this.updateTable();
            this.updateFilterButtonTexts();
            
            // Force a refresh of the table to ensure proper column widths
            setTimeout(() => {
                this.updateTable();
                this.updateKanbanBoard(); // Update kanban board
                this.updateMap(); // Update map after table refresh
            }, 100);
            
            this.saveToLocalStorage();
            
            document.getElementById('spreadsheetData').value = '';
            
            // Show detailed import results
            let message = `Successfully imported ${importedCount} new venues!`;
            if (duplicateCount > 0) {
                message += `\n\n${duplicateCount} duplicate venues were skipped (based on Venue + City + State combination).`;
            }
            if (this.venues.length > 0) {
                message += `\n\nTotal venues in database: ${this.venues.length}`;
            }
            
            alert(message);
            
        } catch (error) {
            alert('Error importing data: ' + error.message);
        }
    }

    calculateColumnWidths() {
        // Create a hash to check if we need to recalculate
        const currentHash = `${this.headers.length}-${this.hiddenColumns.size}-${this.filteredVenues.length}`;
        
        // Return cached result if nothing has changed
        if (this.columnWidthsCache && this.lastColumnCalculationHash === currentHash) {
            return this.columnWidthsCache;
        }
        
        const columnWidths = {};
        
        this.headers.forEach(header => {
            if (this.hiddenColumns.has(header)) return;
            
            // Start with header width
            let maxWidth = this.getTextWidth(header, 'bold 600 14px Segoe UI');
            
            // Sample only first 100 venues for width calculation to improve performance
            const sampleSize = Math.min(100, this.filteredVenues.length);
            for (let i = 0; i < sampleSize; i++) {
                const venue = this.filteredVenues[i];
                const value = venue[header] || '';
                if (value) {
                    const cellWidth = this.getTextWidth(value, '14px Segoe UI');
                    maxWidth = Math.max(maxWidth, cellWidth);
                }
            }
            
            // Add padding and some buffer
            let minWidth = 100; // Default minimum width
            
            // Ensure Status column has adequate width for status badges
            if (header === 'Status') {
                minWidth = 150; // Minimum 150px for status column
            }
            // Ensure Venue column has adequate width
            else if (header === 'Venue') {
                minWidth = 200; // Minimum 200px for venue column
            }
            
            columnWidths[header] = Math.max(maxWidth + 30, minWidth);
        });
        
        // Cache the result
        this.columnWidthsCache = columnWidths;
        this.lastColumnCalculationHash = currentHash;
        
        return columnWidths;
    }

    getTextWidth(text, font) {
        // Create a temporary span element to measure text width
        const span = document.createElement('span');
        span.style.font = font;
        span.style.visibility = 'hidden';
        span.style.position = 'absolute';
        span.style.whiteSpace = 'nowrap';
        span.textContent = text;
        
        document.body.appendChild(span);
        const width = span.offsetWidth;
        document.body.removeChild(span);
        
        return width;
    }

    exportData() {
        if (this.venues.length === 0) {
            alert('No data to export!');
            return;
        }

        // Create CSV content
        let csvContent = this.headers.join('\t') + '\n';
        
        this.venues.forEach(venue => {
            const row = this.headers.map(header => venue[header] || '').join('\t');
            csvContent += row + '\n';
        });

        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/tab-separated-values' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'crm_venues.tsv';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    updateTable() {
        const headerRow = document.getElementById('headerRow');
        const tableBody = document.getElementById('tableBody');
        
        // Clear existing content
        headerRow.innerHTML = '';
        tableBody.innerHTML = '';
        
        // Use document fragment for better performance with large datasets
        const fragment = document.createDocumentFragment();
        
        // Calculate optimal column widths
        const columnWidths = this.calculateColumnWidths();
        
        // Add action column header first
        const actionTh = document.createElement('th');
        actionTh.textContent = 'Actions';
        actionTh.style.width = '120px';
        headerRow.appendChild(actionTh);
        
        // Add headers with sorting capabilities
        this.headers.forEach(header => {
            if (this.hiddenColumns.has(header)) return;
            
            const th = document.createElement('th');
            th.className = 'sortable-header';
            const width = columnWidths[header] || 120;
            th.style.width = width + 'px';
            th.style.minWidth = width + 'px';
            th.style.maxWidth = width + 'px';
            
            // Header content with sort indicator
            const headerContent = document.createElement('div');
            headerContent.className = 'header-content';
            headerContent.innerHTML = `
                <span class="header-text">${header}</span>
                <span class="sort-indicator">${this.getSortIndicator(header)}</span>
            `;
            
            // Make header sortable
            headerContent.addEventListener('click', () => this.sortByColumn(header));
            
            th.appendChild(headerContent);
            headerRow.appendChild(th);
        });
        
        // Calculate pagination
        this.calculatePagination();
        
        // Get current page data
        const startIndex = (this.currentPage - 1) * this.pageSize;
        const endIndex = startIndex + this.pageSize;
        const currentPageData = this.filteredVenues.slice(startIndex, endIndex);
        
        // Add data rows for current page using document fragment
        currentPageData.forEach((venue, index) => {
            const row = document.createElement('tr');
            
            // Add action buttons first
            const actionTd = document.createElement('td');
            actionTd.className = 'action-buttons';
            
            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn edit-btn';
            editBtn.innerHTML = '<i class="fas fa-edit"></i>';
            editBtn.title = 'Edit';
            editBtn.addEventListener('click', () => this.editRow(startIndex + index));
            
            const copyBtn = document.createElement('button');
            copyBtn.className = 'action-btn copy-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Copy';
            copyBtn.addEventListener('click', () => this.copyVenue(venue));
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            deleteBtn.title = 'Delete';
            deleteBtn.addEventListener('click', () => this.deleteRow(startIndex + index));
            
            actionTd.appendChild(editBtn);
            actionTd.appendChild(copyBtn);
            actionTd.appendChild(deleteBtn);
            
            // Add kanban move button only if status is empty
            if (!venue.Status || venue.Status.trim() === '') {
                const kanbanBtn = document.createElement('button');
                kanbanBtn.className = 'action-btn kanban-btn';
                kanbanBtn.innerHTML = '<i class="fas fa-tasks"></i>';
                kanbanBtn.title = 'Add to Kanban (CANVAS)';
                kanbanBtn.addEventListener('click', () => this.addToKanban(venue, startIndex + index));
                actionTd.appendChild(kanbanBtn);
            }
            row.appendChild(actionTd);
            
            // Add data columns
            this.headers.forEach(header => {
                if (this.hiddenColumns.has(header)) return;
                
                const td = document.createElement('td');
                const value = venue[header] || '';
                const width = columnWidths[header] || 120;
                
                // Apply width to data cells as well
                td.style.width = width + 'px';
                td.style.minWidth = width + 'px';
                td.style.maxWidth = width + 'px';
                
                // Apply special formatting for certain fields
                if (header === 'Status' && value) {
                    const statusClass = this.getStatusClass(value);
                    td.innerHTML = `<span class="${statusClass}">${value}</span>`;
                } else if (header === 'Email' && value) {
                    td.innerHTML = `<a href="mailto:${value}">${value}</a>`;
                } else if (header === 'Phone' && value) {
                    td.innerHTML = `<a href="tel:${value}">${value}</a>`;
                } else {
                    td.textContent = value;
                }
                
                row.appendChild(td);
            });
            
            fragment.appendChild(row);
        });
        
        // Append all rows at once for better performance
        tableBody.appendChild(fragment);
        
        // Update pagination controls
        this.updatePaginationControls();
    }

    calculatePagination() {
        this.totalPages = Math.ceil(this.filteredVenues.length / this.pageSize);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
    }

    updatePaginationControls() {
        // Remove existing pagination controls
        const existingPagination = document.querySelector('.pagination-controls');
        if (existingPagination) {
            existingPagination.remove();
        }
        
        // Only show pagination if there are multiple pages
        if (this.totalPages <= 1) return;
        
        // Create pagination container
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'pagination-controls';
        
        // Pagination info
        const startIndex = (this.currentPage - 1) * this.pageSize + 1;
        const endIndex = Math.min(this.currentPage * this.pageSize, this.filteredVenues.length);
        const totalItems = this.filteredVenues.length;
        
        const infoText = document.createElement('div');
        infoText.className = 'pagination-info';
        infoText.textContent = `Showing ${startIndex}-${endIndex} of ${totalItems} venues`;
        
        // Navigation buttons
        const navButtons = document.createElement('div');
        navButtons.className = 'pagination-nav';
        
        // First page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'btn btn-small pagination-btn';
        firstBtn.textContent = '«';
        firstBtn.disabled = this.currentPage === 1;
        firstBtn.addEventListener('click', () => this.goToPage(1));
        
        // Previous page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'btn btn-small pagination-btn';
        prevBtn.textContent = '‹';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
        
        // Page numbers
        const pageNumbers = document.createElement('div');
        pageNumbers.className = 'page-numbers';
        
        // Show up to 5 page numbers around current page
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(this.totalPages, this.currentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn btn-small pagination-btn ${i === this.currentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => this.goToPage(i));
            pageNumbers.appendChild(pageBtn);
        }
        
        // Next page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'btn btn-small pagination-btn';
        nextBtn.textContent = '›';
        nextBtn.disabled = this.currentPage === this.totalPages;
        nextBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
        
        // Last page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'btn btn-small pagination-btn';
        lastBtn.textContent = '»';
        lastBtn.disabled = this.currentPage === this.totalPages;
        lastBtn.addEventListener('click', () => this.goToPage(this.totalPages));
        
        // Page size selector
        const pageSizeSelector = document.createElement('div');
        pageSizeSelector.className = 'page-size-selector';
        pageSizeSelector.innerHTML = `
            <label for="pageSizeSelect">Show:</label>
            <select id="pageSizeSelect">
                <option value="5" ${this.pageSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${this.pageSize === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${this.pageSize === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100</option>
                <option value="200" ${this.pageSize === 200 ? 'selected' : ''}>200</option>
            </select>
        `;
        
        // Add event listener for page size change
        const pageSizeSelect = pageSizeSelector.querySelector('#pageSizeSelect');
        pageSizeSelect.addEventListener('change', (e) => {
            this.pageSize = parseInt(e.target.value);
            this.currentPage = 1; // Reset to first page
            this.updateTable();
            this.saveToLocalStorage(); // Save the setting
        });
        
        // Assemble pagination controls
        navButtons.appendChild(firstBtn);
        navButtons.appendChild(prevBtn);
        navButtons.appendChild(pageNumbers);
        navButtons.appendChild(nextBtn);
        navButtons.appendChild(lastBtn);
        
        paginationContainer.appendChild(infoText);
        paginationContainer.appendChild(navButtons);
        paginationContainer.appendChild(pageSizeSelector);
        
        // Insert after the table
        const tableSection = document.querySelector('.table-section');
        tableSection.appendChild(paginationContainer);
    }

    goToPage(page) {
        if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
            this.currentPage = page;
            this.updateTable();
        }
    }

    addPopupEventListeners(popup, venues) {
        // Add event listeners for edit buttons
        const editButtons = popup.getElement().querySelectorAll('.popup-edit-btn');
        editButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueIndex = parseInt(button.dataset.venueIndex);
                if (venueIndex >= 0 && venueIndex < this.venues.length) {
                    // Find the venue in filtered venues for editing
                    const filteredIndex = this.filteredVenues.findIndex(v => v === this.venues[venueIndex]);
                    if (filteredIndex >= 0) {
                        this.editRow(filteredIndex);
                    } else {
                        // If venue is not in filtered results, show all venues and edit
                        this.filteredVenues = [...this.venues];
                        this.currentPage = 1;
                        this.updateTable();
                        this.updateFilterButtonTexts();
                        const newFilteredIndex = this.filteredVenues.findIndex(v => v === this.venues[venueIndex]);
                        if (newFilteredIndex >= 0) {
                            this.editRow(newFilteredIndex);
                        }
                    }
                    // Close the popup
                    popup.remove();
                }
            });
        });

        // Add event listeners for copy buttons
        const copyButtons = popup.getElement().querySelectorAll('.popup-copy-btn');
        copyButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueIndex = parseInt(button.dataset.venueIndex);
                if (venueIndex >= 0 && venueIndex < this.venues.length) {
                    const venue = this.venues[venueIndex];
                    this.copyVenue(venue);
                    // Close the popup
                    popup.remove();
                }
            });
        });

        // Add event listeners for kanban buttons
        const kanbanButtons = popup.getElement().querySelectorAll('.popup-kanban-btn');
        kanbanButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueIndex = parseInt(button.dataset.venueIndex);
                if (venueIndex >= 0 && venueIndex < this.venues.length) {
                    const venue = this.venues[venueIndex];
                    this.addToKanban(venue, venueIndex);
                    // Close the popup
                    popup.remove();
                }
            });
        });

        // Add event listeners for delete buttons
        const deleteButtons = popup.getElement().querySelectorAll('.popup-delete-btn');
        deleteButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueIndex = parseInt(button.dataset.venueIndex);
                if (venueIndex >= 0 && venueIndex < this.venues.length) {
                    // Find the venue in filtered venues for deletion
                    const filteredIndex = this.filteredVenues.findIndex(v => v === this.venues[venueIndex]);
                    if (filteredIndex >= 0) {
                        this.deleteRow(filteredIndex);
                    } else {
                        // If venue is not in filtered results, show all venues and delete
                        this.filteredVenues = [...this.venues];
                        this.currentPage = 1;
                        this.updateTable();
                        this.updateFilterButtonTexts();
                        const newFilteredIndex = this.filteredVenues.findIndex(v => v === this.venues[venueIndex]);
                        if (newFilteredIndex >= 0) {
                            this.deleteRow(newFilteredIndex);
                        }
                    }
                    // Close the popup
                    popup.remove();
                }
            });
        });
    }

    getSortIndicator(header) {
        if (this.sortColumn !== header) return '↕';
        return this.sortDirection === 'asc' ? '↑' : '↓';
    }

    sortByColumn(column) {
        if (this.sortColumn === column) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = column;
            this.sortDirection = 'asc';
        }
        
        this.filteredVenues.sort((a, b) => {
            let aVal = a[column] || '';
            let bVal = b[column] || '';
            
            // Handle numeric values
            if (!isNaN(aVal) && !isNaN(bVal)) {
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }
            
            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        
        // Reset to first page when sorting
        this.currentPage = 1;
        this.updateTable();
        
        // Save sort settings to localStorage
        this.saveToLocalStorage();
    }

    showColumnToggleModal() {
        if (!this.headers || this.headers.length === 0) {
            alert('Please import some data first before managing columns.');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal column-toggle-modal';
        modal.style.display = 'block';
        
        const modalContent = document.createElement('div');
        modalContent.className = 'modal-content column-toggle-content';
        
        modalContent.innerHTML = `
            <span class="close">&times;</span>
            <h3>Toggle Columns</h3>
            <div class="column-checkboxes">
                ${this.headers.map(header => `
                    <div class="column-checkbox">
                        <input type="checkbox" id="col_${header.replace(/[^a-zA-Z0-9]/g, '_')}" 
                               ${!this.hiddenColumns.has(header) ? 'checked' : ''}>
                        <label for="col_${header.replace(/[^a-zA-Z0-9]/g, '_')}">${header}</label>
                    </div>
                `).join('')}
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-primary" id="applyColumns">Apply</button>
                <button type="button" class="btn btn-secondary" id="cancelColumns">Cancel</button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        modal.querySelector('.close').addEventListener('click', () => this.closeColumnToggleModal(modal));
        modal.querySelector('#cancelColumns').addEventListener('click', () => this.closeColumnToggleModal(modal));
        modal.querySelector('#applyColumns').addEventListener('click', () => {
            this.applyColumnToggle(modal);
            this.closeColumnToggleModal(modal);
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeColumnToggleModal(modal);
            }
        });
    }

    closeColumnToggleModal(modal) {
        modal.remove();
    }

    applyColumnToggle(modal) {
        this.hiddenColumns.clear();
        
        this.headers.forEach(header => {
            const safeId = header.replace(/[^a-zA-Z0-9]/g, '_');
            const checkbox = modal.querySelector(`#col_${safeId}`);
            if (checkbox && !checkbox.checked) {
                this.hiddenColumns.add(header);
            }
        });
        
        this.updateTable();
        this.saveToLocalStorage();
    }

    resetTableLayout() {
        if (confirm('Reset column visibility to default?')) {
            this.hiddenColumns.clear();
            this.sortColumn = null;
            this.sortDirection = 'asc';
            this.updateTable();
            this.saveToLocalStorage();
        }
    }

    getStatusClass(status) {
        if (status.includes('CANVAS')) return 'status-canvas';
        if (status.includes('FOLLOW-UP')) return 'status-follow-up';
        if (status.includes('BOOKED')) return 'status-booked';
        if (status.includes('BOOK-AGAIN')) return 'status-book-again';
        return '';
    }

    updateFilters() {
        // This method is no longer needed since we use filter modals now
        // The filter options are populated when opening the filter modals
        // Keep this method for backward compatibility but make it a no-op
        return;
    }

    applyFilters() {
        const searchFilter = document.getElementById('searchFilter').value.toLowerCase();
        
        // Early exit if no filters are applied
        if (this.statusFilters.length === 0 && 
            this.regionFilters.length === 0 && 
            this.typeFilters.length === 0 && 
            !searchFilter) {
            this.filteredVenues = [...this.venues];
        } else {
        this.filteredVenues = this.venues.filter(venue => {
                // Status filter
                const statusMatch = this.statusFilters.length === 0 || 
                    (venue.Status && this.statusFilters.includes(venue.Status));
                
                // Region filter
                const regionMatch = this.regionFilters.length === 0 || 
                    (venue.Region && this.regionFilters.includes(venue.Region));
                
                // Type filter
                const typeMatch = this.typeFilters.length === 0 || 
                    (venue.Type && this.typeFilters.includes(venue.Type));
                
                // Search filter
            const searchMatch = !searchFilter || 
                Object.values(venue).some(value => 
                    value && value.toString().toLowerCase().includes(searchFilter)
                );
            
            return statusMatch && regionMatch && typeMatch && searchMatch;
        });
        }
        
        // Reset to first page when filtering
        this.currentPage = 1;
        
        // Apply current sorting if exists
        if (this.sortColumn) {
            this.applyCurrentSort();
        } else {
            this.updateTable();
        }
        
        // Update map with current filters and min venue count
        this.updateMap();
    }

    applyCurrentSort() {
        // Apply the current sort settings without changing the direction
        if (!this.sortColumn) return;
        
        this.filteredVenues.sort((a, b) => {
            let aVal = a[this.sortColumn] || '';
            let bVal = b[this.sortColumn] || '';
            
            // Handle numeric values
            if (!isNaN(aVal) && !isNaN(bVal)) {
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }
            
            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        
        this.updateTable();
    }

        

    editRow(index) {
        this.currentEditIndex = index;
        const venue = this.filteredVenues[index];
        
        // Populate general info form
        this.populateGeneralForm(venue);
        
        // Populate venue form
        this.populateVenueForm(venue);
        
        // Populate booking form
        this.populateBookingForm(venue);
        
        // Populate contact form
        this.populateContactForm(venue);
        
        // Populate history tab
        this.populateVenueHistory(venue);
        
        this.openModal();
    }

    populateGeneralForm(venue) {
        const form = document.getElementById('editForm');
        form.innerHTML = '';
        
        // Define general fields (excluding contact, booking, venue fields, and Last Updated)
        const generalFields = this.headers.filter(header => 
            !['Contact', 'Best Time', 'Pref', 'Phone', 'Email', 'Notes', 'Status', 'Last Date', 'Timeline', 'Deadline', 'Played', 'Rate', 'Sets', 'Cap', 'Draw', 'Genre', 'R', 'Last Updated'].includes(header)
        );
        
        // Reorder fields to put Venue first
        const reorderedFields = [];
        
        // Add Venue first if it exists
        if (generalFields.includes('Venue')) {
            reorderedFields.push('Venue');
        }
        
        // Add all other fields
        generalFields.forEach(header => {
            if (header !== 'Venue') {
                reorderedFields.push(header);
            }
        });
        
        reorderedFields.forEach(header => {
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = header;
            
            let input;
            
            // Create dropdowns for specific fields
            if (header === 'Region' || header === 'Type' || header === 'Status') {
                input = document.createElement('select');
                
                // Get unique values for this field from all venues
                const uniqueValues = [...new Set(this.venues.map(v => v[header]).filter(Boolean))];
                
                // Add empty option
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '-- Select --';
                input.appendChild(emptyOption);
                
                // Add existing values as options
                uniqueValues.forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    input.appendChild(option);
                });
                
                // Set current value
                input.value = venue[header] || '';
                
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = venue[header] || '';
            }
            
            input.dataset.field = header;
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            form.appendChild(formGroup);
        });
        
        // Add Last Updated field as read-only
        if (this.headers.includes('Last Updated')) {
            const lastUpdatedGroup = document.createElement('div');
            lastUpdatedGroup.className = 'form-group';
            
            const lastUpdatedLabel = document.createElement('label');
            lastUpdatedLabel.textContent = 'Last Updated';
            
            const lastUpdatedInput = document.createElement('input');
            lastUpdatedInput.type = 'text';
            lastUpdatedInput.value = venue['Last Updated'] ? new Date(venue['Last Updated']).toLocaleString() : '';
            lastUpdatedInput.readOnly = true;
            lastUpdatedInput.style.backgroundColor = '#1a1a1a';
            lastUpdatedInput.style.color = '#a0aec0';
            lastUpdatedInput.style.cursor = 'not-allowed';
            
            lastUpdatedGroup.appendChild(lastUpdatedLabel);
            lastUpdatedGroup.appendChild(lastUpdatedInput);
            form.appendChild(lastUpdatedGroup);
        }
    }

    populateVenueHistory(venue) {
        const historyList = document.getElementById('venueHistoryList');
        if (!historyList) return;
        
        // Get venue ID to match history entries
        const venueId = this.getVenueId(venue);
        
        // Filter history entries for this specific venue
        const venueHistory = this.history.filter(entry => entry.venueId === venueId);
        
        // Sort by timestamp (newest first)
        venueHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        historyList.innerHTML = '';
        
        if (venueHistory.length === 0) {
            historyList.innerHTML = `
                <div class="venue-history-item">
                    <div class="venue-history-no-changes">
                        No history available for this venue.
                    </div>
                </div>
            `;
            return;
        }
        
        // Display each history entry
        venueHistory.forEach(entry => {
            const historyItem = document.createElement('div');
            historyItem.className = 'venue-history-item';
            
            // Format timestamp
            const date = new Date(entry.timestamp);
            const timestamp = date.toLocaleString();
            
            // Create changes display
            let changesHtml = '';
            if (entry.changes && entry.changes.length > 0) {
                changesHtml = entry.changes.map(change => `
                    <div class="venue-history-change-item">
                        <span class="venue-history-change-field">${change.field}:</span>
                        <span class="venue-history-change-old">${change.oldValue || '(empty)'}</span>
                        <span class="venue-history-change-arrow">→</span>
                        <span class="venue-history-change-new">${change.newValue || '(empty)'}</span>
                    </div>
                `).join('');
            } else if (entry.action === 'Add') {
                changesHtml = '<div class="venue-history-no-changes">New venue added</div>';
            } else if (entry.action === 'Delete') {
                changesHtml = '<div class="venue-history-no-changes">Venue deleted</div>';
            }
            
            historyItem.innerHTML = `
                <div class="venue-history-item-header">
                    <span class="venue-history-action ${entry.action.toLowerCase()}">${entry.action}</span>
                    <span class="venue-history-timestamp">${timestamp}</span>
                </div>
                <div class="venue-history-changes">
                    ${changesHtml}
                </div>
            `;
            
            historyList.appendChild(historyItem);
        });
    }

    populateVenueForm(venue) {
        const form = document.getElementById('venueForm');
        form.innerHTML = '';
        
        // Define venue fields
        const venueFields = ['Cap', 'Draw', 'Genre', 'R'];
        
        venueFields.forEach(header => {
            // Only create fields that exist in the headers
            if (!this.headers.includes(header)) return;
            
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = header;
            
            let input;
            
            if (header === 'Cap' || header === 'Draw') {
                input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.step = '1';
                input.value = venue[header] || '';
                
            } else if (header === 'Genre') {
                input = document.createElement('select');
                
                // Get unique values for Genre from all venues
                const uniqueValues = [...new Set(this.venues.map(v => v[header]).filter(Boolean))];
                
                // Add empty option
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '-- Select --';
                input.appendChild(emptyOption);
                
                // Add existing values as options
                uniqueValues.forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    input.appendChild(option);
                });
                
                // Set current value
                input.value = venue[header] || '';
                
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = venue[header] || '';
            }
            
            input.dataset.field = header;
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            form.appendChild(formGroup);
        });
    }

    populateBookingForm(venue) {
        const form = document.getElementById('bookingForm');
        form.innerHTML = '';
        
        // Define booking fields
        const bookingFields = ['Status', 'Last Date', 'Timeline', 'Deadline', 'Played', 'Rate', 'Sets'];
        
        bookingFields.forEach(header => {
            // Only create fields that exist in the headers
            if (!this.headers.includes(header)) return;
            
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = header;
            
            let input;
            
            if (header === 'Status') {
                input = document.createElement('select');
                
                // Get unique values for Status from all venues
                const uniqueValues = [...new Set(this.venues.map(v => v[header]).filter(Boolean))];
                
                // Add empty option
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '-- Select --';
                input.appendChild(emptyOption);
                
                // Add existing values as options
                uniqueValues.forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = value;
                    input.appendChild(option);
                });
                
                // Set current value
                input.value = venue[header] || '';
                
            } else if (header === 'Rate' || header === 'Sets') {
                input = document.createElement('input');
                input.type = 'number';
                input.min = '0';
                input.step = '0.01';
                input.value = venue[header] || '';
                
            } else {
                input = document.createElement('input');
                input.type = 'text';
                input.value = venue[header] || '';
            }
            
            input.dataset.field = header;
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            form.appendChild(formGroup);
        });
    }

    populateContactForm(venue) {
        const form = document.getElementById('contactForm');
        form.innerHTML = '';
        
        // Define contact fields
        const contactFields = ['Contact', 'Best Time', 'Pref', 'Phone', 'Email', 'Notes'];
        
        contactFields.forEach(header => {
            // Only create fields that exist in the headers
            if (!this.headers.includes(header)) return;
            
            const formGroup = document.createElement('div');
            formGroup.className = 'form-group';
            
            const label = document.createElement('label');
            label.textContent = header;
            
            let input;
            
            if (header === 'Notes') {
                input = document.createElement('textarea');
                input.rows = 3;
            } else if (header === 'Phone') {
                input = document.createElement('input');
                input.type = 'tel';
            } else if (header === 'Email') {
                input = document.createElement('input');
                input.type = 'email';
            } else {
                input = document.createElement('input');
                input.type = 'text';
            }
            
            input.value = venue[header] || '';
            input.dataset.field = header;
            
            formGroup.appendChild(label);
            formGroup.appendChild(input);
            form.appendChild(formGroup);
        });
    }

    saveEdit() {
        const generalForm = document.getElementById('editForm');
        const venueForm = document.getElementById('venueForm');
        const bookingForm = document.getElementById('bookingForm');
        const contactForm = document.getElementById('contactForm');
        const allInputs = [
            ...generalForm.querySelectorAll('input, textarea, select'),
            ...venueForm.querySelectorAll('input, textarea, select'),
            ...bookingForm.querySelectorAll('input, textarea, select'),
            ...contactForm.querySelectorAll('input, textarea, select')
        ];
        
        let venue;
        let originalVenue;
        let isNewVenue = false;
        
        if (this.currentEditIndex === -1) {
            // This is a new venue being added
            isNewVenue = true;
            venue = this.tempNewVenue;
            originalVenue = { ...venue };
            
            // Update the venue data with form values
            allInputs.forEach(input => {
                venue[input.dataset.field] = input.value;
            });
            
            // Add the new venue to the arrays
            this.venues.push(venue);
            this.filteredVenues = [...this.venues];
            
            // Add to history
            this.addHistoryEntry('Add', venue);
            
            // Go to the last page to show the new row
            this.calculatePagination();
            this.currentPage = this.totalPages;
            
        } else {
            // This is an existing venue being edited
            venue = this.filteredVenues[this.currentEditIndex];
            originalVenue = { ...venue };
        
        // Update the venue data
            allInputs.forEach(input => {
            venue[input.dataset.field] = input.value;
        });
            
            // Check for changes and add to history
            const changes = this.getChangesDescription(originalVenue, venue);
            if (changes && changes.length > 0) {
                // Update Last Updated timestamp when venue is modified
                venue['Last Updated'] = new Date().toISOString();
                this.addHistoryEntry('Edit', venue, changes);
            }
        
        // Update the main venues array
        const originalIndex = this.venues.findIndex(v => v === venue);
        if (originalIndex !== -1) {
            this.venues[originalIndex] = { ...venue };
            }
        }
        
        // Re-sort if currently sorting by Last Updated
        if (this.sortColumn === 'Last Updated') {
            // Preserve the current sort direction and re-sort
            this.filteredVenues.sort((a, b) => {
                let aVal = a['Last Updated'] || '';
                let bVal = b['Last Updated'] || '';
                
                // Handle date comparison
                if (aVal && bVal) {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                }
                
                if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        this.updateTable();
        } else {
            this.updateTable();
        }
        
        this.updateFilterButtonTexts();
        this.updateKanbanBoard(); // Update kanban board
        this.updateMap(); // Update map after editing
        this.saveToLocalStorage();
        this.closeModal();
        
        // Clear the temporary new venue
        this.tempNewVenue = null;
    }

    deleteRow(index) {
        if (!confirm('Are you sure you want to delete this venue?')) return;
        
        const venue = this.filteredVenues[index];
        const originalIndex = this.venues.findIndex(v => v === venue);
        
        // Add to history before deleting
        this.addHistoryEntry('Delete', venue);
        
        if (originalIndex !== -1) {
            this.venues.splice(originalIndex, 1);
        }
        
        this.filteredVenues.splice(index, 1);
        this.updateTable();
        this.updateFilterButtonTexts();
        this.updateKanbanBoard(); // Update kanban board
        this.updateMap(); // Update map after deleting
        this.saveToLocalStorage();
    }

    addNewRow() {
        // Create a temporary new venue object for editing
        const newVenue = {};
        this.headers.forEach(header => {
            newVenue[header] = '';
        });
        
        // Set Last Updated timestamp for new venue
        newVenue['Last Updated'] = new Date().toISOString();
        
        // Set currentEditIndex to -1 to indicate this is a new venue
        this.currentEditIndex = -1;
        this.tempNewVenue = newVenue;
        
        // Populate the edit modal with the new venue data
        this.populateGeneralForm(newVenue);
        this.populateVenueForm(newVenue);
        this.populateBookingForm(newVenue);
        this.populateContactForm(newVenue);
        this.populateVenueHistory(newVenue);
        
        // Open the edit modal
        this.openModal();
    }

    copyVenue(venue) {
        // Create a copy of the venue with (COPY) added to the name
        const copiedVenue = { ...venue };
        
        // Add (COPY) to the venue name
        if (copiedVenue.Venue) {
            copiedVenue.Venue = copiedVenue.Venue + ' (COPY)';
        }
        
        // Set Last Updated timestamp for the copied venue
        copiedVenue['Last Updated'] = new Date().toISOString();
        
        // Set currentEditIndex to -1 to indicate this is a new venue
        this.currentEditIndex = -1;
        this.tempNewVenue = copiedVenue;
        
        // Populate the edit modal with the copied venue data
        this.populateGeneralForm(copiedVenue);
        this.populateVenueForm(copiedVenue);
        this.populateBookingForm(copiedVenue);
        this.populateContactForm(copiedVenue);
        this.populateVenueHistory(copiedVenue);
        
        // Open the edit modal
        this.openModal();
    }

    addToKanban(venue, index) {
        // Set status to CANVAS (first kanban column)
        venue.Status = 'CANVAS';
        
        // Update Last Updated timestamp
        venue['Last Updated'] = new Date().toISOString();
        
        // Create changes description for history
        const changes = [{
            field: 'Status',
            oldValue: '',
            newValue: 'CANVAS'
        }];
        
        // Add to history
        this.addHistoryEntry('Edit', venue, changes);
        
        // Update the main venues array
        const originalIndex = this.venues.findIndex(v => v === venue);
        if (originalIndex !== -1) {
            this.venues[originalIndex] = { ...venue };
        }
        
        // Re-sort if currently sorting by Last Updated
        if (this.sortColumn === 'Last Updated') {
            // Preserve the current sort direction and re-sort
            this.filteredVenues.sort((a, b) => {
                let aVal = a['Last Updated'] || '';
                let bVal = b['Last Updated'] || '';
                
                // Handle date comparison
                if (aVal && bVal) {
                    aVal = new Date(aVal);
                    bVal = new Date(bVal);
                }
                
                if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
                if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
                return 0;
            });
        this.updateTable();
        } else {
            this.updateTable();
        }
        
        this.updateKanbanBoard(); // Update kanban board
        this.updateMap(); // Update map
        this.saveToLocalStorage();
    }

    clearAllData() {
        if (!confirm('Are you sure you want to clear all data? This cannot be undone!')) return;
        
        this.venues = [];
        this.filteredVenues = [];
        this.headers = [];
        this.hiddenColumns.clear();
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.currentPage = 1;
        this.totalPages = 1;
        this.statusFilters = [];
        this.regionFilters = [];
        this.typeFilters = [];
        this.minVenueCount = 1;
        this.history = [];
        
        this.updateTable();
        this.updateFilterButtonTexts();
        this.updateKanbanBoard(); // Update kanban board
        this.updateMap(); // Update map after clearing data
        this.saveToLocalStorage();
        
        // Clear textarea
        document.getElementById('spreadsheetData').value = '';
        
        // Reset map to default position
        if (this.map) {
            this.map.setView(this.mapCenter, this.mapZoom);
        }
    }

    openModal() {
        document.getElementById('editModal').style.display = 'block';
    }

    closeModal() {
        document.getElementById('editModal').style.display = 'none';
        this.currentEditIndex = -1;
        this.tempNewVenue = null; // Clear temporary new venue if user cancels
    }

    openImportModal() {
        document.getElementById('importModal').style.display = 'block';
        // Clear any previous data
        document.getElementById('spreadsheetData').value = '';
        // Reset to import tab
        this.switchTab('import');
    }

    closeImportModal() {
        document.getElementById('importModal').style.display = 'none';
        // Clear the textarea
        document.getElementById('spreadsheetData').value = '';
        // Clear file input and file name display
        document.getElementById('fileUpload').value = '';
        document.getElementById('fileName').textContent = '';
    }

    initializeImportTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}Tab`).classList.add('active');
    }

    initializeFilterModals() {
        // Status filter modal
        this.setupFilterModal('status');
        // Region filter modal
        this.setupFilterModal('region');
        // Type filter modal
        this.setupFilterModal('type');
    }

    setupFilterModal(filterType) {
        const modal = document.getElementById(`${filterType}FilterModal`);
        const applyBtn = document.getElementById(`${filterType}ApplyBtn`);
        const cancelBtn = document.getElementById(`${filterType}CancelBtn`);
        const selectAllCheckbox = document.getElementById(`${filterType}SelectAll`);
        const clearAllBtn = document.getElementById(`${filterType}ClearAll`);

        // Close modal on outside click
        modal.addEventListener('click', (e) => {
            if (e.target.id === `${filterType}FilterModal`) {
                this.closeFilterModal(filterType);
            }
        });

        // Close button
        modal.querySelector('.close').addEventListener('click', () => this.closeFilterModal(filterType));

        // Apply button
        applyBtn.addEventListener('click', () => this.applyFilterModal(filterType));

        // Cancel button
        cancelBtn.addEventListener('click', () => this.closeFilterModal(filterType));

        // Select all checkbox
        selectAllCheckbox.addEventListener('change', (e) => {
            this.toggleSelectAll(filterType, e.target.checked);
        });

        // Clear all button
        clearAllBtn.addEventListener('click', () => this.clearAllFilters(filterType));
    }

    openFilterModal(filterType) {
        const modal = document.getElementById(`${filterType}FilterModal`);
        this.populateFilterOptions(filterType);
        modal.style.display = 'block';
    }

    closeFilterModal(filterType) {
        const modal = document.getElementById(`${filterType}FilterModal`);
        modal.style.display = 'none';
    }

    populateFilterOptions(filterType) {
        const checkboxesContainer = document.getElementById(`${filterType}Checkboxes`);
        const selectAllCheckbox = document.getElementById(`${filterType}SelectAll`);
        
        // Clear existing options
        checkboxesContainer.innerHTML = '';
        
        // Get unique values for this filter type
        let values = [];
        let currentFilters = [];
        
        switch(filterType) {
            case 'status':
                values = [...new Set(this.venues.map(v => v.Status).filter(Boolean))];
                currentFilters = this.statusFilters || [];
                break;
            case 'region':
                values = [...new Set(this.venues.map(v => v.Region).filter(Boolean))];
                currentFilters = this.regionFilters || [];
                break;
            case 'type':
                values = [...new Set(this.venues.map(v => v.Type).filter(Boolean))];
                currentFilters = this.typeFilters || [];
                break;
        }

        // Create checkbox for each value
        values.forEach(value => {
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'filter-checkbox';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `${filterType}_${value.replace(/[^a-zA-Z0-9]/g, '_')}`;
            checkbox.value = value;
            checkbox.checked = currentFilters.includes(value);
            
            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.textContent = value;
            
            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(label);
            checkboxesContainer.appendChild(checkboxContainer);
        });

        // Update select all checkbox state
        selectAllCheckbox.checked = currentFilters.length === values.length && values.length > 0;
        selectAllCheckbox.indeterminate = currentFilters.length > 0 && currentFilters.length < values.length;
    }

    toggleSelectAll(filterType, checked) {
        const checkboxes = document.querySelectorAll(`#${filterType}Checkboxes input[type="checkbox"]`);
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
        });
    }

    clearAllFilters(filterType) {
        const checkboxes = document.querySelectorAll(`#${filterType}Checkboxes input[type="checkbox"]`);
        checkboxes.forEach(checkbox => {
            checkbox.checked = false;
        });
        const selectAllCheckbox = document.getElementById(`${filterType}SelectAll`);
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }

    clearAllFilters() {
        // Clear all filter arrays
        this.statusFilters = [];
        this.regionFilters = [];
        this.typeFilters = [];
        
        // Clear search input
        document.getElementById('searchFilter').value = '';
        
        // Update filter button texts
        this.updateFilterButtonTexts();
        
        // Directly set filtered venues to all venues (skip applyFilters overhead)
        this.filteredVenues = [...this.venues];
        
        // Reset to first page
        this.currentPage = 1;
        
        // Update table directly
        this.updateTable();
        
        // Update map
        this.updateMap();
        
        // Save to localStorage (async to avoid blocking UI)
        setTimeout(() => this.saveToLocalStorage(), 0);
    }

    applyFilterModal(filterType) {
        const checkboxes = document.querySelectorAll(`#${filterType}Checkboxes input[type="checkbox"]:checked`);
        const selectedValues = Array.from(checkboxes).map(cb => cb.value);
        
        // Store the selected filters
        switch(filterType) {
            case 'status':
                this.statusFilters = selectedValues;
                break;
            case 'region':
                this.regionFilters = selectedValues;
                break;
            case 'type':
                this.typeFilters = selectedValues;
                break;
        }
        
        // Update the filter button text
        this.updateFilterButtonText(filterType, selectedValues);
        
        // Apply the filters
        this.applyFilters();
        
        // Close the modal
        this.closeFilterModal(filterType);
        
        // Save to localStorage to persist filter settings
        this.saveToLocalStorage();
    }

    updateFilterButtonText(filterType, selectedValues) {
        const buttonText = document.getElementById(`${filterType}FilterText`);
        if (!buttonText) {
            // Filter button doesn't exist yet, skip update
            return;
        }
        
        if (selectedValues.length === 0) {
            buttonText.textContent = `All ${filterType.charAt(0).toUpperCase() + filterType.slice(1)}s`;
        } else if (selectedValues.length === 1) {
            buttonText.textContent = selectedValues[0];
        } else {
            buttonText.textContent = `${selectedValues.length} ${filterType}s selected`;
        }
    }

    updateFilterButtonTexts() {
        // Only update if the filter buttons exist
        if (document.getElementById('statusFilterText') && 
            document.getElementById('regionFilterText') && 
            document.getElementById('typeFilterText')) {
            this.updateFilterButtonText('status', this.statusFilters);
            this.updateFilterButtonText('region', this.regionFilters);
            this.updateFilterButtonText('type', this.typeFilters);
        }
    }

    updateKanbanBoard() {
        // Check if kanban elements exist before updating
        if (!document.getElementById('canvasContent') || 
            !document.getElementById('followUpContent') || 
            !document.getElementById('bookedContent') || 
            !document.getElementById('bookAgainContent')) {
            return; // Kanban board not loaded yet
        }
        
        this.populateKanbanColumns();
        this.updateKanbanCounts();
    }

    populateKanbanColumns() {
        // Check if kanban elements exist
        const canvasContent = document.getElementById('canvasContent');
        const followUpContent = document.getElementById('followUpContent');
        const bookedContent = document.getElementById('bookedContent');
        const bookAgainContent = document.getElementById('bookAgainContent');
        
        if (!canvasContent || !followUpContent || !bookedContent || !bookAgainContent) {
            return; // Kanban board not loaded yet
        }
        
        // Clear all columns
        canvasContent.innerHTML = '';
        followUpContent.innerHTML = '';
        bookedContent.innerHTML = '';
        bookAgainContent.innerHTML = '';

        // Group venues by status
        this.venues.forEach(venue => {
            const status = venue.Status || '';
            const card = this.createKanbanCard(venue);
            
            // Skip if card creation failed (kanban board not ready)
            if (!card) return;
            
            if (status.includes('CANVAS')) {
                canvasContent.appendChild(card);
            } else if (status.includes('FOLLOW-UP')) {
                followUpContent.appendChild(card);
            } else if (status.includes('BOOKED')) {
                bookedContent.appendChild(card);
            } else if (status.includes('BOOK-AGAIN')) {
                bookAgainContent.appendChild(card);
            }
        });
    }

    createKanbanCard(venue) {
        // Check if kanban board is ready
        if (!document.getElementById('canvasContent')) {
            return null; // Kanban board not ready yet
        }
        
        const card = document.createElement('div');
        card.className = 'kanban-venue-card';
        card.dataset.venueId = this.venues.indexOf(venue);
        
        const venueName = venue.Venue || 'Unknown Venue';
        const city = venue.City || '';
        const state = venue.State || '';
        const region = venue.Region || '';
        const contact = venue.Contact || '';
        
        card.innerHTML = `
            <h5>${venueName}</h5>
            <p class="venue-location">${city}, ${state}</p>
            ${region ? `<p class="venue-region">${region}</p>` : ''}
            ${contact ? `<p>${contact}</p>` : ''}
            <div class="venue-actions">
                <button class="venue-action-btn edit-action" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="venue-action-btn copy-action" title="Copy">
                    <i class="fas fa-copy"></i>
                </button>
                <button class="venue-action-btn delete-action" title="Delete">
                    <i class="fas fa-trash"></i>
                </button>
                <button class="venue-action-btn move-action" title="Move to next stage">
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        `;
        
        // Add event listeners
        const editBtn = card.querySelector('.edit-action');
        const copyBtn = card.querySelector('.copy-action');
        const deleteBtn = card.querySelector('.delete-action');
        const moveBtn = card.querySelector('.move-action');
        
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.editKanbanVenue(venue);
        });
        
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.copyVenue(venue);
        });
        
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deleteKanbanVenue(venue);
        });
        
        moveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.moveToNextStage(venue);
        });
        
        return card;
    }

    moveToNextStage(venue) {
        const currentStatus = venue.Status || '';
        let newStatus = '';
        
        if (currentStatus.includes('CANVAS')) {
            newStatus = 'FOLLOW-UP';
        } else if (currentStatus.includes('FOLLOW-UP')) {
            newStatus = 'BOOKED';
        } else if (currentStatus.includes('BOOKED')) {
            newStatus = 'BOOK-AGAIN';
        } else if (currentStatus.includes('BOOK-AGAIN')) {
            newStatus = 'CANVAS'; // Loop back to start
        }
        
        if (newStatus) {
            // Store original status for history tracking
            const originalVenue = { ...venue };
            
            venue.Status = newStatus;
            // Update Last Updated timestamp when venue is modified
            venue['Last Updated'] = new Date().toISOString();
            
            // Create changes description for history
            const changes = [{
                field: 'Status',
                oldValue: currentStatus,
                newValue: newStatus
            }];
            
            // Add to history
            this.addHistoryEntry('Edit', venue, changes);
            
            this.updateKanbanBoard();
            
            // Re-sort if currently sorting by Last Updated
            if (this.sortColumn === 'Last Updated') {
                // Preserve the current sort direction and re-sort
                this.filteredVenues.sort((a, b) => {
                    let aVal = a['Last Updated'] || '';
                    let bVal = b['Last Updated'] || '';
                    
                    // Handle date comparison
                    if (aVal && bVal) {
                        aVal = new Date(aVal);
                        bVal = new Date(bVal);
                    }
                    
                    if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
                    if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
                    return 0;
                });
                this.updateTable();
            } else {
                this.updateTable();
            }
            
            this.updateMap();
            this.saveToLocalStorage();
        }
    }

    updateKanbanCounts() {
        // Check if kanban elements exist
        const canvasContent = document.getElementById('canvasContent');
        const followUpContent = document.getElementById('followUpContent');
        const bookedContent = document.getElementById('bookedContent');
        const bookAgainContent = document.getElementById('bookAgainContent');
        const canvasCount = document.getElementById('canvasCount');
        const followUpCount = document.getElementById('followUpCount');
        const bookedCount = document.getElementById('bookedCount');
        const bookAgainCount = document.getElementById('bookAgainCount');
        
        if (!canvasContent || !followUpContent || !bookedContent || !bookAgainContent ||
            !canvasCount || !followUpCount || !bookedCount || !bookAgainCount) {
            return; // Kanban board not ready yet
        }
        
        const canvasCountValue = canvasContent.children.length;
        const followUpCountValue = followUpContent.children.length;
        const bookedCountValue = bookedContent.children.length;
        const bookAgainCountValue = bookAgainContent.children.length;
        
        canvasCount.textContent = canvasCountValue;
        followUpCount.textContent = followUpCountValue;
        bookedCount.textContent = bookedCountValue;
        bookAgainCount.textContent = bookAgainCountValue;
        
    }


    editKanbanVenue(venue) {
        // Find the venue in the filtered venues array
        const filteredIndex = this.filteredVenues.findIndex(v => v === venue);
        
        if (filteredIndex >= 0) {
            // Venue is in filtered results, edit directly
            this.editRow(filteredIndex);
        } else {
            // Venue is not in filtered results, show all venues and edit
            this.filteredVenues = [...this.venues];
            this.currentPage = 1;
            this.updateTable();
            this.updateFilterButtonTexts();
            const newFilteredIndex = this.filteredVenues.findIndex(v => v === venue);
            if (newFilteredIndex >= 0) {
                this.editRow(newFilteredIndex);
            }
        }
    }

    deleteKanbanVenue(venue) {
        // Find the venue in the filtered venues array
        const filteredIndex = this.filteredVenues.findIndex(v => v === venue);
        
        if (filteredIndex >= 0) {
            // Venue is in filtered results, delete directly
            this.deleteRow(filteredIndex);
        } else {
            // Venue is not in filtered results, show all venues and delete
            this.filteredVenues = [...this.venues];
            this.currentPage = 1;
            this.updateTable();
            this.updateFilterButtonTexts();
            const newFilteredIndex = this.filteredVenues.findIndex(v => v === venue);
            if (newFilteredIndex >= 0) {
                this.deleteRow(newFilteredIndex);
            }
        }
    }

    saveToLocalStorage() {
        try {
            localStorage.setItem('crmData', JSON.stringify({
                venues: this.venues,
                headers: this.headers,
                hiddenColumns: Array.from(this.hiddenColumns),
                sortColumn: this.sortColumn,
                sortDirection: this.sortDirection,
                pageSize: this.pageSize,
                statusFilters: this.statusFilters,
                regionFilters: this.regionFilters,
                typeFilters: this.typeFilters,
                minVenueCount: this.minVenueCount,
                mapCenter: this.mapCenter,
                mapZoom: this.mapZoom,
                history: this.history,
                historyPageSize: this.historyPageSize,
                historySearchFilter: this.historySearchFilter
            }));
        } catch (error) {
            console.warn('Could not save to localStorage:', error);
        }
    }

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('crmData');
            if (saved) {
                const data = JSON.parse(saved);
                this.venues = data.venues || [];
                this.headers = data.headers || [];
                this.hiddenColumns = new Set(data.hiddenColumns || []);
                this.sortColumn = data.sortColumn || null;
                this.sortDirection = data.sortDirection || 'asc';
                this.pageSize = data.pageSize || 50;
                this.statusFilters = data.statusFilters || [];
                this.regionFilters = data.regionFilters || [];
                this.typeFilters = data.typeFilters || [];
                this.minVenueCount = data.minVenueCount || 1;
                this.mapCenter = data.mapCenter || [43.2994, -74.2179];
                this.mapZoom = data.mapZoom || 7;
                this.history = data.history || [];
                this.historyPageSize = data.historyPageSize || 5;
                this.historySearchFilter = data.historySearchFilter || '';
                
                if (this.venues.length > 0) {
                    // Apply existing filters to set filteredVenues
                    this.applyFilters();
                    
                    // Set min venues filter input value from stored setting
                    const minVenueInput = document.getElementById('minVenueFilter');
                    if (minVenueInput) {
                        minVenueInput.value = this.minVenueCount;
                    }
                    
                    // Update table and other components after a small delay to ensure all data is loaded
                    setTimeout(() => {
                    this.updateTable();
                        this.updateFilterButtonTexts();
                        this.updateKanbanBoard(); // Update kanban board
                        this.updateMap();
                    }, 50);
                } else {
                    // Even if no venues, still update filter button texts to show default state
                    this.updateKanbanBoard(); // Update kanban board (will show empty state)
                }
                
                // Restore history search filter value
                const historySearchInput = document.getElementById('historySearchFilter');
                if (historySearchInput) {
                    historySearchInput.value = this.historySearchFilter;
                }
                
                // Update history table after data is loaded
                this.updateHistoryTable();
            }
        } catch (error) {
            console.warn('Could not load from localStorage:', error);
        }
    }

    // History tracking methods
    addHistoryEntry(action, venue, changes = null) {
        const venueId = this.getVenueId(venue);
        const timestamp = new Date().toISOString();
        
        const historyEntry = {
            id: Date.now() + Math.random(), // Unique ID
            timestamp: timestamp,
            action: action,
            venueId: venueId,
            venueName: venue.Venue || 'Unknown Venue',
            city: venue.City || '',
            state: venue.State || '',
            changes: changes
        };
        
        this.history.unshift(historyEntry); // Add to beginning of array
        
        this.updateHistoryTable();
        this.saveToLocalStorage();
    }
    
    getVenueId(venue) {
        const venueName = (venue.Venue || '').trim().toLowerCase();
        const city = (venue.City || '').trim().toLowerCase();
        const state = (venue.State || '').trim().toLowerCase();
        return `${venueName}|${city}|${state}`;
    }
    
    getChangesDescription(oldVenue, newVenue) {
        const changes = [];
        const allKeys = new Set([...Object.keys(oldVenue), ...Object.keys(newVenue)]);
        
        allKeys.forEach(key => {
            const oldValue = oldVenue[key] || '';
            const newValue = newVenue[key] || '';
            
            if (oldValue !== newValue) {
                changes.push({
                    field: key,
                    oldValue: oldValue,
                    newValue: newValue
                });
            }
        });
        
        return changes.length > 0 ? changes : null;
    }

    updateHistoryTable() {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return; // History table not loaded yet
        
        tbody.innerHTML = '';
        
        // Apply search filter
        let filteredHistory = this.history;
        if (this.historySearchFilter) {
            filteredHistory = this.history.filter(entry => {
                const searchTerm = this.historySearchFilter.toLowerCase();
                return (
                    entry.venueName.toLowerCase().includes(searchTerm) ||
                    entry.city.toLowerCase().includes(searchTerm) ||
                    entry.state.toLowerCase().includes(searchTerm) ||
                    entry.action.toLowerCase().includes(searchTerm) ||
                    (entry.changes && entry.changes.some(change => 
                        change.field.toLowerCase().includes(searchTerm) ||
                        (change.oldValue && change.oldValue.toString().toLowerCase().includes(searchTerm)) ||
                        (change.newValue && change.newValue.toString().toLowerCase().includes(searchTerm))
                    ))
                );
            });
        }
        
        // Calculate pagination
        this.historyTotalPages = Math.ceil(filteredHistory.length / this.historyPageSize);
        if (this.historyCurrentPage > this.historyTotalPages) {
            this.historyCurrentPage = Math.max(1, this.historyTotalPages);
        }
        
        // Get current page data
        const startIndex = (this.historyCurrentPage - 1) * this.historyPageSize;
        const endIndex = startIndex + this.historyPageSize;
        const currentPageData = filteredHistory.slice(startIndex, endIndex);
        
        // Display history entries
        currentPageData.forEach(entry => {
            const row = document.createElement('tr');
            
            // Format timestamp
            const date = new Date(entry.timestamp);
            const timestamp = date.toLocaleString();
            
            // Create changes display
            let changesHtml = '';
            if (entry.changes && entry.changes.length > 0) {
                changesHtml = entry.changes.map(change => `
                    <div class="history-change-item">
                        <span class="history-change-field">${change.field}:</span>
                        <span class="history-change-old">${change.oldValue || '(empty)'}</span>
                        <span class="history-change-arrow">→</span>
                        <span class="history-change-new">${change.newValue || '(empty)'}</span>
                    </div>
                `).join('');
            } else if (entry.action === 'Add') {
                changesHtml = '<span style="color: #28a745; font-style: italic;">New venue added</span>';
            } else if (entry.action === 'Delete') {
                changesHtml = '<span style="color: #dc3545; font-style: italic;">Venue deleted</span>';
            }
            
            row.innerHTML = `
                <td class="history-actions">
                    ${entry.action !== 'Delete' ? `
                        <button class="action-btn edit-btn history-edit-btn" title="Edit Venue" data-venue-id="${entry.venueId}">
                            <i class="fas fa-edit"></i>
                        </button>
                    ` : ''}
                </td>
                <td class="history-timestamp">${timestamp}</td>
                <td><span class="history-action ${entry.action.toLowerCase()}">${entry.action}</span></td>
                <td class="history-venue">${entry.venueName}</td>
                <td class="history-location">${entry.city}, ${entry.state}</td>
                <td class="history-changes">${changesHtml}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        // Add event listeners for history edit buttons
        const historyEditButtons = tbody.querySelectorAll('.history-edit-btn');
        historyEditButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const venueId = button.dataset.venueId;
                this.editVenueFromHistory(venueId);
            });
        });
        
        // Show message if no history
        if (currentPageData.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="6" style="text-align: center; color: #a0aec0; padding: 20px;">
                    ${this.history.length === 0 ? 'No history available' : 
                      filteredHistory.length === 0 ? 'No entries match your search' : 'No entries on this page'}
                </td>
            `;
            tbody.appendChild(row);
        }
        
        // Update pagination controls
        this.updateHistoryPaginationControls();
    }

    updateHistoryPaginationControls() {
        // Remove existing pagination controls
        const existingPagination = document.querySelector('.history-pagination-controls');
        if (existingPagination) {
            existingPagination.remove();
        }
        
        // Only show pagination if there are 5+ entries
        if (this.history.length < 5) return;
        
        // Create pagination container
        const paginationContainer = document.createElement('div');
        paginationContainer.className = 'history-pagination-controls';
        
        // Apply search filter to get filtered count
        let filteredHistory = this.history;
        if (this.historySearchFilter) {
            filteredHistory = this.history.filter(entry => {
                const searchTerm = this.historySearchFilter.toLowerCase();
                return (
                    entry.venueName.toLowerCase().includes(searchTerm) ||
                    entry.city.toLowerCase().includes(searchTerm) ||
                    entry.state.toLowerCase().includes(searchTerm) ||
                    entry.action.toLowerCase().includes(searchTerm) ||
                    (entry.changes && entry.changes.some(change => 
                        change.field.toLowerCase().includes(searchTerm) ||
                        (change.oldValue && change.oldValue.toString().toLowerCase().includes(searchTerm)) ||
                        (change.newValue && change.newValue.toString().toLowerCase().includes(searchTerm))
                    ))
                );
            });
        }
        
        // Pagination info
        const startIndex = (this.historyCurrentPage - 1) * this.historyPageSize + 1;
        const endIndex = Math.min(this.historyCurrentPage * this.historyPageSize, filteredHistory.length);
        const totalItems = filteredHistory.length;
        
        const infoText = document.createElement('div');
        infoText.className = 'history-pagination-info';
        infoText.textContent = `Showing ${startIndex}-${endIndex} of ${totalItems} history entries`;
        
        // Navigation buttons
        const navButtons = document.createElement('div');
        navButtons.className = 'history-pagination-nav';
        
        // First page button
        const firstBtn = document.createElement('button');
        firstBtn.className = 'history-pagination-btn';
        firstBtn.textContent = '«';
        firstBtn.disabled = this.historyCurrentPage === 1;
        firstBtn.addEventListener('click', () => this.goToHistoryPage(1));
        
        // Previous page button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'history-pagination-btn';
        prevBtn.textContent = '‹';
        prevBtn.disabled = this.historyCurrentPage === 1;
        prevBtn.addEventListener('click', () => this.goToHistoryPage(this.historyCurrentPage - 1));
        
        // Page numbers
        const pageNumbers = document.createElement('div');
        pageNumbers.className = 'history-page-numbers';
        
        // Show up to 5 page numbers around current page
        const startPage = Math.max(1, this.historyCurrentPage - 2);
        const endPage = Math.min(this.historyTotalPages, this.historyCurrentPage + 2);
        
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `history-pagination-btn ${i === this.historyCurrentPage ? 'active' : ''}`;
            pageBtn.textContent = i;
            pageBtn.addEventListener('click', () => this.goToHistoryPage(i));
            pageNumbers.appendChild(pageBtn);
        }
        
        // Next page button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'history-pagination-btn';
        nextBtn.textContent = '›';
        nextBtn.disabled = this.historyCurrentPage === this.historyTotalPages;
        nextBtn.addEventListener('click', () => this.goToHistoryPage(this.historyCurrentPage + 1));
        
        // Last page button
        const lastBtn = document.createElement('button');
        lastBtn.className = 'history-pagination-btn';
        lastBtn.textContent = '»';
        lastBtn.disabled = this.historyCurrentPage === this.historyTotalPages;
        lastBtn.addEventListener('click', () => this.goToHistoryPage(this.historyTotalPages));
        
        // Page size selector
        const pageSizeSelector = document.createElement('div');
        pageSizeSelector.className = 'history-page-size-selector';
        pageSizeSelector.innerHTML = `
            <label for="historyPageSizeSelect">Show:</label>
            <select id="historyPageSizeSelect">
                <option value="5" ${this.historyPageSize === 5 ? 'selected' : ''}>5</option>
                <option value="10" ${this.historyPageSize === 10 ? 'selected' : ''}>10</option>
                <option value="25" ${this.historyPageSize === 25 ? 'selected' : ''}>25</option>
                <option value="50" ${this.historyPageSize === 50 ? 'selected' : ''}>50</option>
                <option value="100" ${this.historyPageSize === 100 ? 'selected' : ''}>100</option>
                <option value="200" ${this.historyPageSize === 200 ? 'selected' : ''}>200</option>
            </select>
        `;
        
        // Add event listener for page size change
        const pageSizeSelect = pageSizeSelector.querySelector('#historyPageSizeSelect');
        pageSizeSelect.addEventListener('change', (e) => {
            this.historyPageSize = parseInt(e.target.value);
            this.historyCurrentPage = 1; // Reset to first page
            this.updateHistoryTable();
            this.saveToLocalStorage(); // Save the setting
        });
        
        // Assemble pagination controls
        navButtons.appendChild(firstBtn);
        navButtons.appendChild(prevBtn);
        navButtons.appendChild(pageNumbers);
        navButtons.appendChild(nextBtn);
        navButtons.appendChild(lastBtn);
        
        paginationContainer.appendChild(infoText);
        paginationContainer.appendChild(navButtons);
        paginationContainer.appendChild(pageSizeSelector);
        
        // Insert after the history table
        const historySection = document.querySelector('.history-section');
        historySection.appendChild(paginationContainer);
    }

    goToHistoryPage(page) {
        if (page >= 1 && page <= this.historyTotalPages && page !== this.historyCurrentPage) {
            this.historyCurrentPage = page;
            this.updateHistoryTable();
        }
    }

    clearHistory() {
        if (confirm('Are you sure you want to clear all history? This cannot be undone!')) {
            this.history = [];
            this.historyCurrentPage = 1;
            this.historyTotalPages = 1;
            this.updateHistoryTable();
            this.saveToLocalStorage();
        }
    }

    applyHistoryFilters() {
        const searchFilter = document.getElementById('historySearchFilter').value.toLowerCase();
        this.historySearchFilter = searchFilter;
        
        // Reset to first page when filtering
        this.historyCurrentPage = 1;
        
        // Update history table
        this.updateHistoryTable();
    }

    editVenueFromHistory(venueId) {
        // Find the venue in the current venues array using the venue ID
        const venue = this.venues.find(v => this.getVenueId(v) === venueId);
        
        if (venue) {
            // Find the venue in filtered venues for editing
            const filteredIndex = this.filteredVenues.findIndex(v => v === venue);
            if (filteredIndex >= 0) {
                // Venue is in filtered results, edit directly
                this.editRow(filteredIndex);
            } else {
                // Venue is not in filtered results, show all venues and edit
                this.filteredVenues = [...this.venues];
                this.currentPage = 1;
                this.updateTable();
                this.updateFilterButtonTexts();
                const newFilteredIndex = this.filteredVenues.findIndex(v => v === venue);
                if (newFilteredIndex >= 0) {
                    this.editRow(newFilteredIndex);
                }
            }
        } else {
            // Venue not found - might have been deleted
            alert('This venue is no longer available for editing. It may have been deleted.');
        }
    }

    initializeHistoryEventListeners() {
        // Clear history button
        const clearHistoryBtn = document.getElementById('clearHistoryBtn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => this.clearHistory());
        }
        
        // History search input
        const historySearchFilter = document.getElementById('historySearchFilter');
        if (historySearchFilter) {
            historySearchFilter.addEventListener('input', (e) => this.debouncedHistorySearch(e.target.value));
        }
    }

    // Debounce utility method
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Initialize the CRM when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new SimpleCRM();
});
