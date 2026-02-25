/**
 * Frame TV Art Card v1.0.0
 */

class FrameTVArtCard extends HTMLElement {
  constructor() {
    super();
    this._config = {};
    this._hass = null;
    this._dropdownOpen = false;
    this._lastStateHash = '';
  }

  setConfig(config) {
    this._config = {
      title: config.title || 'Frame TV Art',
      icon: config.icon || 'mdi:palette',
      // MQTT-first configuration: entity that exposes settings via attributes
      settings_entity: config.settings_entity || 'sensor.frame_tv_art_settings',
      // Default to MQTT-discovered sensors provided by the container
      collections_entity: config.collections_entity || 'sensor.frame_tv_art_collections',
      selected_artwork_file_entity: config.selected_artwork_file_entity || 'sensor.frame_tv_art_selected_artwork',
      selected_collections_entity: config.selected_collections_entity || 'sensor.frame_tv_art_selected_collections',
      // Optional: allow overriding legacy helpers if desired
      add_button_entity: config.add_button_entity, // legacy keys no longer used
      remove_button_entity: config.remove_button_entity, // legacy keys no longer used
      clear_button_entity: config.clear_button_entity, // legacy keys no longer used
      // Single base path for images served by Home Assistant (/local maps to /config/www)
      image_path: config.image_path || '/local/images/frame_tv_art_collections',
      standby_image_path: config.standby_image_path,
      ...config
    };
    // don't eagerly build standby path here; compute based on protocol when needed
    this._lastStateHash = '';
    // No CSV fetch required; all metadata comes from MQTT sensor attributes
  }

  _getBaseImagePath() {
    // Single unified base path (no http/https split needed when using /local)
    return this._config.image_path || '';
  }

  set hass(hass) {
    this._hass = hass;
    
    // Sync baseline from HA state; keep staged when dropdown is open
    const fromState = this._getSelectedCollections();
    this._baselineSelected = Array.isArray(fromState) ? [...fromState] : [];
    if (!Array.isArray(this._currentSelected) || !this._dropdownOpen) {
      this._currentSelected = [...this._baselineSelected];
    }
    
    // Don't re-render if dropdown is open
    if (this._dropdownOpen) return;
    
    // Only re-render if relevant state changed
    const newHash = this._getStateHash();
    if (newHash === this._lastStateHash) return;
    this._lastStateHash = newHash;
    
    this._render();
  }

  _getStateHash() {
    // Create a hash of the states we care about
    const file = this._getSelectedData().file || '';
    const selected = this._getState(this._config.selected_collections_entity);
    const options = this._getOptions(this._config.collections_entity).join(',');
    return `${file}|${selected}|${options}`;
  }

  _getState(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return '';
    return this._hass.states[entityId].state;
  }

  _getAttrs(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return {};
    return this._hass.states[entityId].attributes || {};
  }

  _getOptions(entityId) {
    if (!this._hass || !this._hass.states[entityId]) return [];
    return this._hass.states[entityId].attributes.options || [];
  }

  _arraysEqual(a, b) {
    const aa = (a || []).slice().sort();
    const bb = (b || []).slice().sort();
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
    return true;
  }

  _getSelectedCollections() {
    const raw = this._getState(this._config.selected_collections_entity);
    if (!raw || raw === 'unknown' || raw === 'unavailable' || raw === 'None' || raw === '') {
      return [];
    }
    return raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  // CSV helpers removed — card relies on MQTT attributes and filename fallback

  _parseArtworkInfo(file) {
    if (!file || file === 'unknown' || file === 'unavailable' || file === 'None' || file === '') {
      return null;
    }

    // Remove file extension
    const raw = file.replace(/\.(jpg|jpeg|png|gif|bmp|webp)$/i, '');

    // Parse details from filename as a fallback
    // Remove file extension if present
    let cleanRaw = raw;
    
    let artist = null;
    let title = cleanRaw;
    let year = null;

    // First try to parse underscore-separated format: Artist_Year_Title
    const underscoreParts = cleanRaw.split('_');
    if (underscoreParts.length >= 3) {
      // Check if second part is a 4-digit year
      const possibleYear = underscoreParts[1];
      if (/^\d{4}$/.test(possibleYear) && parseInt(possibleYear) >= 1000 && parseInt(possibleYear) <= 2100) {
        artist = underscoreParts[0].replace(/_/g, ' ');
        year = possibleYear;
        title = underscoreParts.slice(2).join(' ').replace(/_/g, ' ');
      } else {
        // Not the expected format, treat as title with possible artist
        title = cleanRaw.replace(/_/g, ' ');
      }
    } else {
      // Fallback to space/dash parsing for other formats
      title = cleanRaw;
      
      // Extract year in parentheses
      const yearMatch = title.match(/\((\d{4})\)/);
      if (yearMatch) {
        year = yearMatch[1];
        title = title.replace(/\s*\(\d{4}\)/, '');
      }

      // Extract artist if there's a separator
      const artistMatch = title.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (artistMatch) {
        artist = artistMatch[1].trim();
        title = artistMatch[2].trim();
      }
    }

    return {
      artist: artist,
      title: title,
      year: year
    };
  }

  _getSelectedData() {
    // Try to read a JSON-packed state from the configured entity.
    // Fallback to treating state as a plain filename.
    const entityId = this._config.selected_artwork_file_entity;
    const raw = this._getState(entityId);
    const attrs = this._getAttrs(entityId);

    // Preferred: attributes provided by an MQTT sensor (file, collection, display)
    if (attrs && (attrs.file || attrs.display || attrs.collection)) {
      return {
        file: attrs.file || '',
        display: attrs.display || null,
        collection: attrs.collection || null,
      };
    }
    if (!raw || raw === 'unknown' || raw === 'unavailable') {
      return { file: '', display: null, collection: null };
    }
    const trimmed = (raw || '').trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const obj = JSON.parse(trimmed);
        return {
          file: obj.file || '',
          display: obj.display || null,
          collection: obj.collection || null,
        };
      } catch (_) {
        // fall through to plain string
      }
    }
    return { file: trimmed, display: null, collection: null };
  }

  _escapeHtml(text) {
    if (text == null) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _formatInline(text) {
    // Escape first to prevent injection, then apply simple inline formatting
    let s = this._escapeHtml(text);
    // Bold: **text** or *text*
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<strong>$1</strong>');
    // Italic: _text_
    s = s.replace(/_(.+?)_/g, '<em>$1</em>');
    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  _formatMultiline(text) {
    const s = this._formatInline(text);
    return s.replace(/\r?\n/g, '<br>');
  }

  async _updateArtworkText(file, _, isStandby) {
    try {
      let artworkText;
      const entityId = this._config.selected_artwork_file_entity;
      const attrs = this._getAttrs(entityId);
      
      if (isStandby) {
        artworkText = 'Please stand by as artwork is loaded...';
      } else {
        // Prefer MQTT attributes if provided by the sensor
        const title = attrs.artwork_title || null;
        const year = attrs.artwork_year || null;
        const artist = attrs.artist_name || null;
        const lifespan = attrs.artist_lifespan || null;
        const medium = attrs.artwork_medium || attrs.artist_medium || null;
        const descriptionRaw = attrs.artwork_description;
        const description = (typeof descriptionRaw === 'string') ? descriptionRaw.trim() : '';
        const hasDescription = !!(description && !/^\s*(null|none|n\/a)\s*$/i.test(description) && description !== (file || ''));
        if (title || artist || year || lifespan || medium || hasDescription) {
          const titleText = title || file || 'Selected Artwork';
          // Top: artist_name (artist_lifespan)
          const topLine = (artist || lifespan) ? `
            <div style="line-height:1.3; margin-top: 2px;">
              ${artist ? `<span style=\"font-size:1.1em; font-weight:bold; color: white;\">${this._formatInline(artist)}</span>` : ''}
              ${lifespan ? `<span style=\"font-size:0.9em; color: rgba(255,255,255,0.7);\"> (${lifespan})</span>` : ''}
            </div>
          ` : '';
          // Middle: artwork_title, artwork_year (title italic, year lighter)
          const middleLine = `
            <div style="line-height:1.3; margin-top: 8px;">
              <em style="font-size:1.1em; color: white;">${this._formatInline(titleText)}</em>
              ${year ? `<span style=\"font-size:0.9em; color: rgba(255,255,255,0.7);\">, ${year}</span>` : ''}
            </div>
          `;
          // Bottom: artwork_medium
          const bottomLine = medium ? `
            <div style="font-size:0.9em; color: rgba(255,255,255,0.7); line-height:1.4; margin-top: 4px;">${this._formatInline(medium)}</div>
          ` : '';
          artworkText = `${topLine}${middleLine}${bottomLine}`;
          if (hasDescription) {
            artworkText += `<hr style="border: none; border-top: 1px solid rgba(255,255,255,0.3); margin: 8px 0; width: calc(100% + 20px); margin-left: -10px;"><div style="text-align: justify; color: rgba(255,255,255,0.7); font-size: 0.9em; line-height: 1.4;">${this._formatMultiline(description)}</div>`;
          }
        } else {
          // Fallback to filename parsing (no lifespan/medium available)
          const displayInfo = this._parseArtworkInfo(file);
          const fTitle = displayInfo?.title || file || 'Selected Artwork';
          const fYear = displayInfo?.year || null;
          const fArtist = displayInfo?.artist || null;
          const topLine = fArtist ? `
            <div style="line-height:1.3; margin-top: 2px;">
              <span style="font-size:1.1em; font-weight:bold; color: white;">${this._formatInline(fArtist)}</span>
            </div>
          ` : '';
          const middleLine = `
            <div style="line-height:1.3; margin-top: 8px;">
              <em style="font-size:1.1em; color: white;">${this._formatInline(fTitle)}</em>
              ${fYear ? `<span style=\"font-size:0.9em; color: rgba(255,255,255,0.7);\">, ${fYear}</span>` : ''}
            </div>
          `;
          artworkText = `${topLine}${middleLine}`;
        }
      }

      // Update only the info text without re-rendering everything
      const infoDiv = this.querySelector('.ftv-info');
      if (infoDiv) {
        infoDiv.innerHTML = artworkText;
      }
      
      // Also update background if we now have metadata
      this._updateBackgroundFromCsv();
    } catch (error) {
      console.warn('Error updating artwork text:', error);
      // Fallback to filename parsing on error
      const fallbackInfo = this._parseArtworkInfo(file);
      const fTitle = fallbackInfo?.title || file || 'Selected Artwork';
      const fYear = fallbackInfo?.year || null;
      const fArtist = fallbackInfo?.artist || null;
      const artworkText = isStandby 
        ? 'Please stand by as artwork is loaded...'
        : `
        ${fArtist ? `<div style=\"line-height:1.3; margin-top: 2px;\"><span style=\"font-size:1.1em; font-weight:bold; color: white;\">${this._formatInline(fArtist)}</span></div>` : ''}
            <div style=\"line-height:1.3; margin-top: 8px;\"><em style=\"font-size:1.1em; color: white;\">${this._formatInline(fTitle)}</em>${fYear ? `<span style=\"font-size:0.9em; color: rgba(255,255,255,0.7);\">, ${fYear}</span>` : ''}</div>
          `;
      
      const infoDiv = this.querySelector('.ftv-info');
      if (infoDiv) {
        infoDiv.innerHTML = artworkText;
      }
    }
  }

  _updateBackgroundFromCsv() {
    const entityId = this._config.selected_artwork_file_entity;
    const { file } = this._getSelectedData();
    const attrs = this._getAttrs(entityId);
    if (!file || file === 'unknown' || file === 'unavailable' || file === 'None' || file === '' || file === 'standby.png') {
      return;
    }
    // Prefer collection from attributes, then artist_name; fallback to filename prefix
    let folder = attrs.collection || attrs.artist_name || null;
    if (!folder) {
      const match = file.match(/^(.+?)_[^_]+_/);
      if (match) folder = match[1];
    }
    if (folder) {
      const base = this._getBaseImagePath();
      const bgUrl = `${base}/${encodeURIComponent(folder)}/${encodeURIComponent(file)}`;
      
      // Update the card background directly
      const cardDiv = this.querySelector('.ftv-card');
      if (cardDiv) {
        // Log the computed URL for debugging (network/CORS/mixed-content issues)
        try { console.info('FRAME-TV-ART-CARD: computed bgUrl ->', bgUrl); } catch (e) {}
        // Detect likely mixed-content (http image on https page)
        if (typeof window !== 'undefined' && bgUrl.startsWith('http:') && window.location && window.location.protocol === 'https:') {
          const infoDiv = this.querySelector('.ftv-info');
          if (infoDiv) {
            infoDiv.innerHTML = (infoDiv.innerHTML || '') + '<div style="color: #ffcc00; margin-top:8px; font-size:0.9em;">Warning: image URL uses http: and may be blocked by browser mixed-content policy.</div>';
          }
          try { console.warn('FRAME-TV-ART-CARD: image URL uses http on https page — likely blocked by mixed-content'); } catch (e) {}
        }
        cardDiv.style.background = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url("${bgUrl}")`;
        cardDiv.style.backgroundSize = 'cover';
        cardDiv.style.backgroundPosition = 'center';
        
        // Also update text colors for dark background
        const headerDiv = this.querySelector('.ftv-header');
        if (headerDiv) headerDiv.style.color = 'white';
        
        const controlsDiv = this.querySelector('.ftv-controls');
        if (controlsDiv) controlsDiv.style.color = 'white';
        
        const infoDiv = this.querySelector('.ftv-info');
        if (infoDiv) {
          infoDiv.style.background = 'rgba(0,0,0,0.5)';
          infoDiv.style.color = 'white';
        }
      }
    }
  }

  _callService(domain, service, data) {
    if (this._hass) this._hass.callService(domain, service, data);
  }

  _handleCollectionToggle(collection, wasSelected) {
    // Stage-only: do not publish until Apply is clicked
    if (wasSelected) {
      this._currentSelected = this._currentSelected.filter(s => s !== collection);
    } else {
      if (!this._currentSelected.includes(collection)) this._currentSelected.push(collection);
    }
  }

  _getBackgroundUrl() {
    const entityId = this._config.selected_artwork_file_entity;
    const { file } = this._getSelectedData();
    const attrs = this._getAttrs(entityId);
    if (!file || file === 'unknown' || file === 'unavailable' || file === 'None' || file === '' || file === 'standby.png') {
      // Return configured standby path if present, else use protocol-appropriate standby under base
      if (this._config.standby_image_path) return this._config.standby_image_path;
      return `${this._getBaseImagePath()}/standby.png`;
    }

    // Prefer explicit collection from attributes, then artist_name; else fallback to filename prefix
    if (attrs && attrs.collection) {
      return `${this._getBaseImagePath()}/${encodeURIComponent(attrs.collection)}/${encodeURIComponent(file)}`;
    }
    if (attrs && attrs.artist_name) {
      return `${this._getBaseImagePath()}/${encodeURIComponent(attrs.artist_name)}/${encodeURIComponent(file)}`;
    }
    const match = file.match(/^(.+?)_[^_]+_/);
    if (match) {
      const collection = match[1];
      return `${this._getBaseImagePath()}/${encodeURIComponent(collection)}/${encodeURIComponent(file)}`;
    }
    
    return null;
  }
  

  _render() {
    if (!this._hass) return;
    const { file } = this._getSelectedData();
    const selectedCollections = this._baselineSelected || this._getSelectedCollections();
    const options = this._getOptions(this._config.collections_entity).filter(opt => opt !== '@eaDir');
    const selectedOptions = options.filter(opt => selectedCollections.includes(opt)).sort();
    const unselectedOptions = options.filter(opt => !selectedCollections.includes(opt)).sort();
    const sortedOptions = [...selectedOptions, ...unselectedOptions];
    const artworkInfo = this._parseArtworkInfo(file);
    const bgUrl = this._getBackgroundUrl();
    const isStandby = file === 'standby.png';
    const hasArtwork = bgUrl !== null;

    // Initialize staged selection to baseline on render
    this._currentSelected = Array.isArray(this._currentSelected) && this._dropdownOpen
      ? this._currentSelected
      : [...selectedCollections];

    const selectedText = this._currentSelected.length > 0 
      ? 'Selected: ' + this._currentSelected.join(', ')
      : 'Select collections...';

    // Initial placeholder - will be updated asynchronously by _updateArtworkText
    let artworkText = 'Loading...';

    // Update artwork text asynchronously from database (don't block render)
    setTimeout(() => {
      this._updateArtworkText(file, file, isStandby);
    }, 100);

    this.innerHTML = `
      <ha-card>
        <style>
          ha-card {
            overflow: visible;
          }
          .ftv-card {
            padding: 12px;
            border-radius: var(--ha-card-border-radius, 12px);
            ${hasArtwork ? `background: linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url("${bgUrl}"); background-size: cover; background-position: center;` : ''}
          }
          .ftv-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 0 0 8px 0;
            margin-bottom: 12px;
            ${hasArtwork ? 'color: white;' : ''}
          }
          .ftv-header .spacer { flex: 1; }
          .ftv-gear {
            margin-left: auto;
            background: transparent;
            border: none;
            cursor: pointer;
            color: inherit;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 32px; height: 32px;
            border-radius: 6px;
          }
          .ftv-gear:hover { background: rgba(255,255,255,0.12); }
          .ftv-settings {
            display: none;
            position: absolute;
            right: 12px;
            top: 56px;
            background: rgba(30,30,30,0.98);
            border: 1px solid var(--divider-color, #444);
            border-radius: 8px;
            padding: 12px;
            z-index: 10000;
            color: #f0f0f0;
            width: 280px;
            box-shadow: 0 6px 18px rgba(0,0,0,0.4);
          }
          .ftv-settings.open { display: block; }
          .ftv-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
          .ftv-label { font-size: 0.85em; color: rgba(255,255,255,0.7); }
          .ftv-input { padding: 8px; border: 1px solid #555; background: #222; color: #fff; border-radius: 6px; }
          .ftv-settings .actions { display: flex; flex-direction: row; gap: 8px; }
          .ftv-btn { padding: 10px 12px; border: none; border-radius: 6px; cursor: pointer; width: auto; box-sizing: border-box; flex: 1 1 50%; }
          .ftv-btn.primary { background: #2f7fbf; color: #fff; }
          .ftv-btn.ghost { background: transparent; color: #fff; border: 1px solid #555; }
          .ftv-icon-wrap {
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .ftv-icon-wrap ha-icon {
            --mdc-icon-size: 24px;
            color: var(--primary-color, #03a9f4);
          }
          .ftv-controls {
            border-radius: 8px;
            margin-bottom: 8px;
            ${hasArtwork ? 'color: white;' : ''}
          }
          .ftv-row {
            display: flex;
            gap: 8px;
          }
          .ftv-dropdown-wrap {
            flex: 1;
            position: relative;
            min-width: 0;
          }
          .ftv-trigger {
            width: 100%;
            padding: 10px 12px;
            border-radius: 8px;
            border: 1px solid rgba(255,255,255,0.3);
            background: ${hasArtwork ? 'rgba(0,0,0,0.5)' : 'var(--input-fill-color, #f5f5f5)'};
            color: inherit;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            box-sizing: border-box;
          }
          .ftv-trigger:hover {
            border-color: var(--primary-color, #03a9f4);
          }
          .ftv-trigger-text {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            flex: 1;
          }
          .ftv-trigger-arrow {
            margin-left: 8px;
            transition: transform 0.2s;
          }
          .ftv-trigger.open .ftv-trigger-arrow {
            transform: rotate(180deg);
          }
          .ftv-dropdown {
            display: none;
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            margin-top: 4px;
            background: rgba(30,30,30,0.95);
            border: 1px solid var(--divider-color, #ccc);
            border-radius: 8px;
            max-height: 250px;
            overflow-y: auto;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            color: white;
          }
          .ftv-controls {
            position: relative;
          }
          .ftv-dropdown.open {
            display: block;
          }
          .ftv-option {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            gap: 10px;
          }
          .ftv-option:hover {
            background: rgba(3, 169, 244, 0.1);
          }
          .ftv-option.selected {
            background: rgba(3, 169, 244, 0.15);
          }
          .ftv-checkbox {
            width: 20px;
            height: 20px;
            border: 2px solid #ccc;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .ftv-option.selected .ftv-checkbox {
            background: var(--primary-color, #03a9f4);
            border-color: var(--primary-color, #03a9f4);
          }
          .ftv-checkbox svg {
            width: 14px;
            height: 14px;
            fill: white;
            opacity: 0;
          }
          .ftv-option.selected .ftv-checkbox svg {
            opacity: 1;
          }
          .ftv-clear {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            background: #db4437;
            color: white;
            cursor: pointer;
            display: ${selectedCollections.length > 0 ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
          }
          .ftv-info {
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 12px;
            border-radius: 8px;
            ${hasArtwork ? 'background: rgba(0,0,0,0.5); color: white;' : ''}
          }
          .ftv-apply {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            background: var(--primary-color, #03a9f4);
            color: white;
            cursor: pointer;
            display: none;
            align-items: center;
            justify-content: center;
          }
          .ftv-refresh {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 8px;
            background: #4a6fa5;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .ftv-apply[disabled] {
            opacity: 0.5;
            cursor: default;
          }
        </style>
        <div class="ftv-card">
          <div class="ftv-header">
            <div class="ftv-icon-wrap">
              <ha-icon icon="${this._config.icon}"></ha-icon>
            </div>
            <span>${this._config.title}</span>
            <span class="spacer"></span>
            <button class="ftv-gear" id="ftv-gear" title="Settings">
              <ha-icon icon="mdi:cog"></ha-icon>
            </button>
          </div>
          <div class="ftv-controls">
            <div class="ftv-row">
                <div class="ftv-dropdown-wrap">
                  <div class="ftv-trigger" id="ftv-trigger">
                    <span class="ftv-trigger-text">${selectedText}</span>
                    <span class="ftv-trigger-arrow">▼</span>
                  </div>
                  <div class="ftv-dropdown" id="ftv-dropdown">
                    ${sortedOptions.map(opt => `
                      <div class="ftv-option ${this._currentSelected.includes(opt) ? 'selected' : ''}" data-value="${opt}">
                        <div class="ftv-checkbox">
                          <svg viewBox="0 0 24 24"><path d="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z"/></svg>
                        </div>
                        <span>${opt}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
                <button class="ftv-refresh" id="ftv-refresh" title="Refresh uploads">
                  <ha-icon icon="mdi:refresh"></ha-icon>
                </button>
                <button class="ftv-apply" id="ftv-apply" title="Apply selections">
                  <ha-icon icon="mdi:check"></ha-icon>
                </button>
                <button class="ftv-clear" id="ftv-clear">
                  <ha-icon icon="mdi:delete"></ha-icon>
                </button>
              </div>
          </div>
          <div class="ftv-info">${artworkText}</div>
          <div class="ftv-settings" id="ftv-settings">
            <div class="ftv-field">
              <div class="ftv-label">Frame TV IP address</div>
              <input class="ftv-input" id="ftv-tv-ip" type="text" placeholder="e.g. 10.83.21.57" />
            </div>
            <div class="ftv-field">
              <div class="ftv-label">Max uploads</div>
              <input class="ftv-input" id="ftv-max-uploads" type="number" min="1" placeholder="e.g. 30" />
            </div>
            <div class="ftv-field">
              <div class="ftv-label">Interval minutes</div>
              <input class="ftv-input" id="ftv-interval-mins" type="number" min="0" placeholder="e.g. 30" />
            </div>
            <div class="actions">
              <button class="ftv-btn primary" id="ftv-apply-env" disabled>Apply & Refresh</button>
              <button class="ftv-btn ghost" id="ftv-restart-env">Restart Uploader</button>
            </div>
            <div class="ftv-label" id="ftv-env-msg" style="margin-top:6px;"></div>
          </div>
        </div>
      </ha-card>
    `;
    // Settings panel logic
    const gear = this.querySelector('#ftv-gear');
    const panel = this.querySelector('#ftv-settings');
    const inMax = this.querySelector('#ftv-max-uploads');
    const inMins = this.querySelector('#ftv-interval-mins');
    const inIp = this.querySelector('#ftv-tv-ip');
    const btnApplyEnv = this.querySelector('#ftv-apply-env');
    const btnRestartEnv = this.querySelector('#ftv-restart-env');
    const btnRefresh = this.querySelector('#ftv-refresh');
    const envMsg = this.querySelector('#ftv-env-msg');
    const settingsEntity = this._config.settings_entity;
    let envBaseline = {};
    function envDirty() {
      const changed = (
        String(inMax.value||'') !== String(envBaseline.SAMSUNG_TV_ART_MAX_UPLOADS||'') ||
        String(inMins.value||'') !== String(envBaseline.SAMSUNG_TV_ART_UPDATE_MINUTES||'') ||
        String(inIp.value||'') !== String(envBaseline.SAMSUNG_TV_ART_TV_IP||'')
      );
      if (btnApplyEnv) { btnApplyEnv.disabled = !changed; }
    }
    const loadEnv = () => {
      try {
        if (!settingsEntity || !this._hass) return;
        const st = this._hass.states[settingsEntity];
        const attrs = (st && st.attributes) || {};
        envBaseline = {
          SAMSUNG_TV_ART_MAX_UPLOADS: attrs.SAMSUNG_TV_ART_MAX_UPLOADS || '',
          SAMSUNG_TV_ART_UPDATE_MINUTES: attrs.SAMSUNG_TV_ART_UPDATE_MINUTES || '',
          SAMSUNG_TV_ART_TV_IP: attrs.SAMSUNG_TV_ART_TV_IP || '',
        };
        if (inMax) inMax.value = envBaseline.SAMSUNG_TV_ART_MAX_UPLOADS;
        if (inMins) inMins.value = envBaseline.SAMSUNG_TV_ART_UPDATE_MINUTES;
        if (inIp) inIp.value = envBaseline.SAMSUNG_TV_ART_TV_IP;
        envDirty();
      } catch (_) {}
    };
    if (gear && panel) {
      gear.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('open');
        if (panel.classList.contains('open')) loadEnv();
      });
      document.addEventListener('click', (e) => {
        const path = (typeof e.composedPath === 'function') ? e.composedPath() : [];
        const inside = (panel && path.includes(panel)) || (gear && path.includes(gear));
        if (!inside) panel.classList.remove('open');
      }, { capture: true });
    }
    if (inMax) inMax.addEventListener('input', envDirty);
    if (inMins) inMins.addEventListener('input', envDirty);
    if (inIp) inIp.addEventListener('input', envDirty);
    if (btnApplyEnv) btnApplyEnv.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const payload = {
          SAMSUNG_TV_ART_MAX_UPLOADS: String(inMax.value||'').trim(),
          SAMSUNG_TV_ART_UPDATE_MINUTES: String(inMins.value||'').trim(),
          SAMSUNG_TV_ART_TV_IP: String(inIp.value||'').trim(),
        };
        // Publish settings via MQTT
        if (this._hass) {
          this._hass.callService('mqtt', 'publish', { topic: 'frame_tv/cmd/settings/set', payload: JSON.stringify(payload), qos: 1, retain: false });
          this._hass.callService('mqtt', 'publish', { topic: 'frame_tv/cmd/settings/refresh', payload: JSON.stringify({ req_id: Date.now() }), qos: 1, retain: false });
        }
        btnApplyEnv.textContent = 'Applying…';
        btnApplyEnv.disabled = true;
        if (envMsg) envMsg.textContent = 'Applying settings and requesting refresh…';
        setTimeout(() => { btnApplyEnv.textContent = 'Apply & Refresh'; envBaseline = payload; envDirty(); if (envMsg) envMsg.textContent=''; }, 4000);
      } catch (_) {}
    });

    if (btnRestartEnv) btnRestartEnv.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        if (this._hass) {
          this._hass.callService('mqtt', 'publish', { topic: 'frame_tv/cmd/settings/restart', payload: JSON.stringify({ req_id: Date.now() }), qos: 1, retain: false });
        }
        if (envMsg) envMsg.textContent = 'Restarting uploader...';
        btnRestartEnv.disabled = true;
        setTimeout(() => { btnRestartEnv.disabled = false; if (envMsg && envMsg.textContent==='Restarting uploader...') envMsg.textContent=''; }, 6000);
      } catch (_) {}
    });

    if (btnRefresh) btnRefresh.addEventListener('click', (e) => {
      e.stopPropagation();
      try {
        if (this._hass) {
          this._hass.callService('mqtt', 'publish', { topic: 'frame_tv/cmd/collections/refresh', payload: JSON.stringify({ req_id: Date.now() }), qos: 1, retain: false });
        }
        if (envMsg) envMsg.textContent = 'Requested collections refresh...';
        btnRefresh.disabled = true;
        setTimeout(() => { btnRefresh.disabled = false; if (envMsg && envMsg.textContent==='Requested collections refresh...') envMsg.textContent=''; }, 6000);
      } catch (_) {}
    });

    // Poll for applied values as a soft ACK (HA frontend cannot subscribe MQTT directly)
    const pollApplied = () => {
      try {
        if (!panel || !panel.classList.contains('open')) return;
        const st = this._hass && settingsEntity ? this._hass.states[settingsEntity] : null;
        const attrs = (st && st.attributes) || {};
        const ok = (
          String(attrs.SAMSUNG_TV_ART_MAX_UPLOADS||'') === String(inMax.value||'') &&
          String(attrs.SAMSUNG_TV_ART_UPDATE_MINUTES||'') === String(inMins.value||'') &&
          String(attrs.SAMSUNG_TV_ART_TV_IP||'') === String(inIp.value||'')
        );
        if (ok && envMsg) { envMsg.textContent = 'Settings applied.'; setTimeout(() => { if (envMsg.textContent==='Settings applied.') envMsg.textContent=''; }, 6000); }
      } catch (_) {}
      setTimeout(pollApplied, 2000);
    };
    setTimeout(pollApplied, 2000);

    // Event handlers
    const trigger = this.querySelector('#ftv-trigger');
    const dropdown = this.querySelector('#ftv-dropdown');
    const dropdownWrap = this.querySelector('.ftv-dropdown-wrap');
    
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      this._dropdownOpen = !this._dropdownOpen;
      trigger.classList.toggle('open', this._dropdownOpen);
      dropdown.classList.toggle('open', this._dropdownOpen);
    });

    this.querySelectorAll('.ftv-option').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        const wasSelected = this._currentSelected.includes(val);
        if (wasSelected) {
          this._currentSelected = this._currentSelected.filter(s => s !== val);
        } else {
          this._currentSelected.push(val);
        }
        opt.classList.toggle('selected', !wasSelected);
        // Update trigger text
        const triggerText = this.querySelector('.ftv-trigger-text');
        if (triggerText) {
          triggerText.textContent = this._currentSelected.length > 0 
            ? 'Selected: ' + this._currentSelected.join(', ')
            : 'Select collections...';
        }
        // Toggle clear button visibility dynamically
        const clearBtn = this.querySelector('#ftv-clear');
        if (clearBtn) clearBtn.style.display = this._currentSelected.length > 0 ? 'flex' : 'none';
        this._handleCollectionToggle(val, wasSelected);
        // Toggle apply based on diff from baseline
        const applyBtn = this.querySelector('#ftv-apply');
        const changed = !this._arraysEqual(this._currentSelected, this._baselineSelected);
        if (applyBtn) {
          applyBtn.style.display = changed ? 'flex' : 'none';
          applyBtn.disabled = !changed;
        }
      });
    });

    this.querySelector('#ftv-clear').addEventListener('click', (e) => {
      e.stopPropagation();
      // Stage-only clear; apply must be clicked to publish
      this._currentSelected = [];
      const triggerText = this.querySelector('.ftv-trigger-text');
      if (triggerText) triggerText.textContent = 'Select collections...';
      const clearBtn = this.querySelector('#ftv-clear');
      if (clearBtn) clearBtn.style.display = 'none';
      const applyBtn = this.querySelector('#ftv-apply');
      if (applyBtn) {
        const changed = !this._arraysEqual(this._currentSelected, this._baselineSelected);
        applyBtn.style.display = changed ? 'flex' : 'none';
        applyBtn.disabled = !changed;
      }
      this.querySelectorAll('.ftv-option.selected').forEach(o => o.classList.remove('selected'));
    });

    // Apply button publishes staged selections in one update
    const applyBtn = this.querySelector('#ftv-apply');
    if (applyBtn) {
      const changed = !this._arraysEqual(this._currentSelected, this._baselineSelected);
      applyBtn.style.display = changed ? 'flex' : 'none';
      applyBtn.disabled = !changed;
      applyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this._hass) return;
        const topic = 'frame_tv/cmd/collections/set';
        const payload = { collections: this._currentSelected.slice(), req_id: Date.now() };
        this._hass.callService('mqtt', 'publish', { topic, payload: JSON.stringify(payload) });
        // Optimistically align baseline to staged
        this._baselineSelected = this._currentSelected.slice();
        applyBtn.style.display = 'none';
        applyBtn.disabled = true;
      });
    }

    // Reverted: keep default sizing behavior (background-size: cover) without dynamic min-height

      }

      _trySetBackground(el, urls) {
      if (!urls || urls.length === 0) return;
      const tryNext = (i) => {
        if (i >= urls.length) return;
        const url = urls[i];
        const img = new Image();
        img.onload = () => {
          el.style.background = `linear-gradient(rgba(0,0,0,0.1), rgba(0,0,0,0.1)), url("${url}")`;
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
        };
        img.onerror = () => tryNext(i+1);
        img.src = url;
      };
      tryNext(0);
    }
  }

console.info('%c FRAME-TV-ART-CARD %c v1.5.0 ', 'color: white; background: #03a9f4; font-weight: bold;', '');

// Register custom element so Lovelace can use <frame-tv-art-card>
try {
  if (!customElements.get('frame-tv-art-card')) {
    customElements.define('frame-tv-art-card', FrameTVArtCard);
  }
} catch (e) {
  console.warn('Failed to register frame-tv-art-card:', e);
}
