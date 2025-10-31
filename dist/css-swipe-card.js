class CssSwipeCard extends HTMLElement {
  static get version() {
    return 'v0.8.0';
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.currentIndex = 0;
    this.resizeObserver = null;
  }

  // Core setup and rendering methods
  setConfig(config) {
    if (!config || !config.cards || !Array.isArray(config.cards)) {
      throw new Error('You need to define cards');
    }

    this.cardId = config.cardId || `css-swipe-card-${Math.random().toString(36).substr(2, 9)}`;

    this.config = {
      width: '100%',
      template: 'slider-horizontal',
      auto_height: false,
      card_gap: '0px',
      timer: 0,
      pagination: false,
      navigation: false,
      navigation_next: '',
      navigation_prev: '',
      loop: false,
      custom_css: {},
      cardId: this.cardId,
      ...config
    };

    this.render();
  }

  async render() {
    const styles = this.getStyles();
    const html = this.getHtml();

    this.shadowRoot.innerHTML = `<style>${styles}</style>${html}`;

    const cardContainer = this.shadowRoot.querySelector(`.${this.config.template}`);
    this._cards = [];

    for (const [index, cardConfig] of this.config.cards.entries()) {
      const card = await this.createCardElement(cardConfig);
      const slide = document.createElement('div');
      slide.classList.add('slide');
      slide.style.width = '100%';
      slide.dataset.index = index;
      slide.dataset.logicalIndex = index;
      card.classList.add('card-element');
      slide.appendChild(card);
      cardContainer.appendChild(slide);
      this._cards.push(card);
    }

    if (this.config.auto_height) {
      this.setupResizeObserver();
    } else {
      await this.setManualHeight();
    }

    this.applyCustomStyles();

    // Check if any cards are conditional - if so, delay pagination setup until after cleanup
    const hasConditionalCards = this.config.cards.some(card => card.type === 'conditional');

    if (this.config.pagination && !hasConditionalCards) {
      this.setupPagination(); // Only setup now if no conditional cards
    }

    if (this.config.navigation) {
      this.setupNavigation();
    }

    this.setupTimer();

    const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
    slider.addEventListener('scroll', () => {
      this.updateCurrentIndex();
      this.updatePagination();
    });

    if (this._hass) {
      this.checkInputNumberState();
    }

    // Remove empty conditional slides after render completes, THEN setup pagination/looping
    requestAnimationFrame(() => {
      setTimeout(() => {
        this.removeEmptySlides();

        // Setup pagination if we have conditional cards (was deferred earlier)
        if (this.config.pagination && hasConditionalCards) {
          this.setupPagination();
        }

        // Setup looping AFTER conditional cards are cleaned up
        if (this.config.loop && this._cards.length >= 3) {
          this.setupLooping();
        }
      }, 300); // Wait longer for conditional cards to fully evaluate
    });
  }

  // HTML and CSS generation methods
  getStyles() {
    return `
      :host {
        --slides-gap: ${this.config.card_gap};
        --slides-align-items: center;
        --pagination-bullet-active-background-color: var(--primary-text-color);
        --pagination-bullet-background-color: var(--primary-background-color);
        --pagination-bullet-border: 1px solid #999;
        --pagination-bullet-distance: 10px;
        --navigation-button-next-color: var(--primary-text-color);
        --navigation-button-next-background-color: var(--primary-background-color);
        --navigation-button-next-width: 40px;
        --navigation-button-next-height: 40px;
        --navigation-button-next-border-radius: 100%;
        --navigation-button-next-border: none;
        --navigation-button-prev-color: var(--primary-text-color);
        --navigation-button-prev-background-color: var(--primary-background-color);
        --navigation-button-prev-width: 40px;
        --navigation-button-prev-height: 40px;
        --navigation-button-prev-border-radius: 100%;
        --navigation-button-prev-border: none;
        --navigation-button-distance: 10px;
      }
      #${this.cardId} { 
        position: relative;
        overflow: hidden;
        
        /* Force hardware acceleration with 3D transform */
        transform: translateZ(0);
        -webkit-transform: translateZ(0);
        -moz-transform: translateZ(0);
        -ms-transform: translateZ(0);
        -o-transform: translateZ(0);

        /* Existing properties */
        backface-visibility: hidden;
        perspective: 1000;
        -webkit-backface-visibility: hidden;
        -webkit-perspective: 1000;
        -moz-backface-visibility: hidden;
        -moz-perspective: 1000;
        -ms-backface-visibility: hidden;
        -ms-perspective: 1000;
    
        will-change: transform;
        -webkit-overflow-scrolling: touch;
      }
      #${this.cardId} .slider-horizontal {
        display: flex;
        overflow-x: auto;
        overflow-y: hidden;
        scroll-snap-type: x mandatory;
        scroll-behavior: smooth;
        position: relative;
        gap: var(--slides-gap);
        padding-inline: var(--slides-gap);
      }
      #${this.cardId} .slider-vertical {
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        overflow-x: hidden;
        scroll-snap-type: y mandatory;
        scroll-behavior: smooth;
        position: relative;
        gap: var(--slides-gap);
        padding-block: var(--slides-gap);
      }
      #${this.cardId} .slider-horizontal,
      #${this.cardId} .slider-vertical {
        &::-webkit-scrollbar {
          display: none;
        }
        scrollbar-width: none;
        -ms-overflow-style: none;
        
      }
      #${this.cardId} .slide {
        display: flex;
        min-width: 100%;
        align-items: var(--slides-align-items);
        justify-content: center;
        scroll-snap-align: start;
      }
      #${this.cardId} .card-element {
        width: 100% !important;
        scroll-snap-align: start;
        scroll-snap-stop: always;
      }
      #${this.cardId} .pagination-control.horizontal {
        position: absolute;
        bottom: var(--pagination-bullet-distance);
        left: 50%;
        align-items: center;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
      }
      #${this.cardId} .pagination-control.vertical {
        position: absolute;
        top: 50%;
        right: var(--pagination-bullet-distance);
        align-items: center;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      #${this.cardId} .pagination-bullet {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background-color: var(--pagination-bullet-background-color, var(--primary-background-color));
          border: var(--pagination-bullet-border, 1px solid #999);
          cursor: pointer;
          padding: 0;
          transition: all 0.3s ease;
      }
      #${this.cardId} .pagination-bullet.active {
          background-color: var(--pagination-bullet-active-background-color, var(--primary-text-color));
          width: 12px;
          height: 12px;
      }
      #${this.cardId} .navigation-button {
        position: absolute;
        border: none;
        cursor: pointer;
        font-size: 24px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        transition: transform 0.1s;
      }
      #${this.cardId} .navigation-button:active {
        animation: buttonPress 0.2s ease-out;
      }
      #${this.cardId} .navigation-button.prev-horizontal {
        width: var(--navigation-button-prev-width);
        height: var(--navigation-button-prev-height);
        left: var(--navigation-button-distance);
        top: 50%;
        margin-top: calc(-1 * var(--navigation-button-prev-height) / 2);
        color: var(--navigation-button-prev-color);
        background: var(--navigation-button-prev-background-color);
        border-radius: var(--navigation-button-prev-border-radius);
        border: var(--navigation-button-prev-border);
        transition: transform 0.1s;
      }
      #${this.cardId} .navigation-button.next-horizontal {
        width: var(--navigation-button-next-width);
        height: var(--navigation-button-next-height);
        right: var(--navigation-button-distance);
        top: 50%;
        margin-top: calc(-1 * var(--navigation-button-next-height) / 2);
        color: var(--navigation-button-next-color);
        background: var(--navigation-button-next-background-color);
        border-radius: var(--navigation-button-next-border-radius);
        border: var(--navigation-button-next-border);
        transition: transform 0.1s;
      }
      #${this.cardId} .navigation-button.prev-vertical {
        width: var(--navigation-button-prev-width);
        height: var(--navigation-button-prev-height);
        top: var(--navigation-button-distance);
        left: 50%;
        margin-left: calc(-1 * var(--navigation-button-prev-width) / 2);
        color: var(--navigation-button-prev-color);
        background: var(--navigation-button-prev-background-color);
        border-radius: var(--navigation-button-prev-border-radius);
        border: var(--navigation-button-prev-border);
        transition: transform 0.1s;
      }
      #${this.cardId} .navigation-button.next-vertical {
        width: var(--navigation-button-next-width);
        height: var(--navigation-button-next-height);
        bottom: var(--navigation-button-distance);
        left: 50%;
        margin-left: calc(-1 * var(--navigation-button-next-width) / 2);
        color: var(--navigation-button-next-color);
        background: var(--navigation-button-next-background-color);
        border-radius: var(--navigation-button-next-border-radius);
        border: var(--navigation-button-next-border);
        transition: transform 0.1s;
      }
      #${this.cardId} .navigation-button ha-icon {
        width: 80%;
        height: 80%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #${this.cardId} .navigation-button, #${this.cardId} .pagination-control label {
        -webkit-tap-highlight-color: transparent;
        outline: none;
      }
      #${this.cardId} .navigation-button ha-icon,
      #${this.cardId} .pagination-control label {
        pointer-events: none;
      }
      @keyframes buttonPress {
        0% {
          transform: scale(1);
        }
        50% {
          transform: scale(0.9);
        }
        100% {
          transform: scale(1);
        }
      }
    `;
  }

  getHtml() {
    return `
      <div id="${this.cardId}">
        <div class="${this.config.template}"></div>
        ${this.config.pagination ? `<div class="pagination-control ${this.config.template === 'slider-horizontal' ? 'horizontal' : 'vertical'}"></div>` : ''}
        ${this.config.navigation ? `
          <button class="navigation-button prev-${this.config.template === 'slider-horizontal' ? 'horizontal' : 'vertical'}">
            ${this.config.navigation_prev ? `<ha-icon icon="${this.config.navigation_prev}"></ha-icon>` : (this.config.template === 'slider-horizontal' ? '&lt;' : '&uarr;')}
          </button>
          <button class="navigation-button next-${this.config.template === 'slider-horizontal' ? 'horizontal' : 'vertical'}">
            ${this.config.navigation_next ? `<ha-icon icon="${this.config.navigation_next}"></ha-icon>` : (this.config.template === 'slider-horizontal' ? '&gt;' : '&darr;')}
          </button>
        ` : ''}
      </div>
    `;
  }

  // Card creation and sizing methods
  async createCardElement(cardConfig) {
    const createCard = (await loadCardHelpers()).createCardElement;
    const element = createCard(cardConfig);
    element.hass = this._hass;
    return element;
  }

  async getCardSize() {
    if (!this._cards) {
      return 0;
    }

    let maxHeight = 0;

    for (const card of this._cards) {
      if (card.getCardSize) {
        const size = await card.getCardSize();
        maxHeight = Math.max(maxHeight, size * 50);
      } else {
        await card.updateComplete;
        const rect = card.getBoundingClientRect();
        maxHeight = Math.max(maxHeight, rect.height);
      }
    }

    return maxHeight || 140; // fallback to 140 if maxHeight is 0
  }

  async getMaxCardHeight() {
    let maxHeight = 0;
    for (const card of this._cards) {
      await card.updateComplete;  // Ensure card is fully rendered
      const rect = card.getBoundingClientRect();
      maxHeight = Math.max(maxHeight, rect.height);
    }
    return maxHeight || 140;  // Fallback height
  }

  // Card container height adjustment methods
  async adjustCardContainerHeight() {
    const cardContainer = this.shadowRoot.querySelector(`.${this.config.template}`);
    const slideContainer = this.shadowRoot.querySelector(`.slide`);
    const maxHeight = await this.getMaxCardHeight();

    if (this.config.auto_height) {
        this._cards.forEach(card => {
            card.style.height = `${maxHeight}px`;
        });
        cardContainer.style.height = `${maxHeight}px`;
        slideContainer.style.height = `${maxHeight}px`;
    } else {
        cardContainer.style.height = `${maxHeight}px`;
        slideContainer.style.height = `${maxHeight}px`;
        this._cards.forEach(card => {
            card.style.height = 'auto';  // Keeps native height for cards
        });
    }

    if (this.config.height && !this.config.auto_height) {
        cardContainer.style.height = this.config.height;
        slideContainer.style.height = this.config.height;
        this._cards.forEach(card => {
            card.style.height = this.config.height;
        });
    }
  }

  async setManualHeight() {
    const cardContainer = this.shadowRoot.querySelector(`.${this.config.template}`);
    const isHorizontal = this.config.template === 'slider-horizontal';

    if (isHorizontal) {
      cardContainer.style.height = this.config.height;
      cardContainer.style.overflowY = 'hidden';
    } else {
      // For vertical mode
      const maxHeight = await this.getMaxCardHeight();
      cardContainer.style.height = this.config.height || `${maxHeight}px`;
      cardContainer.style.overflowY = 'auto';
    }

    this._cards.forEach(card => {
      if (isHorizontal) {
        card.style.height = this.config.height;
      } else {
        card.style.height = 'auto'; // Keep native height for cards in vertical mode
      }
    });
  }

  // Resize observer setup
  setupResizeObserver() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.adjustCardContainerHeight();
      this.updateCurrentIndex();
      this.updatePagination();
    });

    this._cards.forEach(card => {
      this.resizeObserver.observe(card);
    });
  }

  // Current index update method
  updateCurrentIndex() {
    const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
    const isHorizontal = this.config.template === 'slider-horizontal';
    const scrollPosition = isHorizontal ? slider.scrollLeft : slider.scrollTop;
    const viewportSize = isHorizontal ? slider.clientWidth : slider.clientHeight;

    // Get slides in current DOM order
    const slides = Array.from(this.shadowRoot.querySelectorAll('.slide'));

    let accumulatedSize = 0;
    for (let i = 0; i < slides.length; i++) {
      const slide = slides[i];
      const cardSize = isHorizontal ? slide.offsetWidth : slide.offsetHeight;
      if (scrollPosition < accumulatedSize + cardSize / 2) {
        // Use logical index, not DOM position
        this.currentIndex = parseInt(slide.dataset.logicalIndex);
        break;
      }
      accumulatedSize += cardSize;
    }
  }

  // Home Assistant integration methods
  set hass(hass) {
    const oldHass = this._hass;
    this._hass = hass;

    if (!oldHass) {
      this.setupInputNumberListener();
      this.checkInputNumberState();
    }

    const cardContainer = this.shadowRoot.querySelector(`.${this.config.template}`);
    if (cardContainer) {
      cardContainer.childNodes.forEach((child) => {
        if (child.firstChild) {
          child.firstChild.hass = hass;
        }
      });
    }

    const inputNumberEntity = `input_number.${this.config.cardId}`;
    if (oldHass && hass.states[inputNumberEntity] !== oldHass.states[inputNumberEntity]) {
      this.checkInputNumberState();
    }

    // Check if conditional card entities changed (debounced cleanup)
    if (oldHass && this.config.cards) {
      let conditionalEntityChanged = false;

      // Extract entities from conditional cards
      this.config.cards.forEach(cardConfig => {
        if (cardConfig.type === 'conditional' && cardConfig.conditions) {
          cardConfig.conditions.forEach(condition => {
            const entityId = condition.entity;
            if (oldHass.states[entityId]?.state !== hass.states[entityId]?.state) {
              conditionalEntityChanged = true;
            }
          });
        }
      });

      if (conditionalEntityChanged) {
        // Debounce re-render to avoid excessive renders
        clearTimeout(this._conditionalDebounce);
        this._conditionalDebounce = setTimeout(() => {
          // Full re-render needed to show/hide cards based on new conditions
          this.render();
        }, 100);
      }
    }
  }

  setupInputNumberListener() {
    const inputNumberEntity = `input_number.${this.config.cardId}`;
    this._hass.connection.subscribeEvents(
      (event) => this.handleInputNumberChange(event),
      'state_changed',
      { entity_id: inputNumberEntity }
    );
  }

  checkInputNumberState() {
    const inputNumberEntity = `input_number.${this.config.cardId}`;
    const state = this._hass.states[inputNumberEntity];
    if (state) {
      const inputNumber = parseFloat(state.state);
      if (inputNumber !== 0) {
        const calcIndex = this.calcIndex(inputNumber);
        if (calcIndex >= 0) {
          requestAnimationFrame(() => {
            this.scrollToCardByIndex(calcIndex);
            setTimeout(() => {
              this.resetInputNumber();
            }, 500);
          });
        }
      }
    }
  }

  handleInputNumberChange(event) {
    if (event.data.entity_id === `input_number.${this.config.cardId}`) {
      const newState = event.data.new_state;
      if (newState && newState.state) {
        const inputNumber = parseFloat(newState.state);
        if (inputNumber !== 0) {
          const calcIndex = this.calcIndex(inputNumber);
          if (calcIndex >= 0) {
            this.scrollToCardByIndex(calcIndex).then(() => {
              this.resetInputNumber();
            });
          }
        }
      }
    }
  }

  resetInputNumber() {
    if (!this._hass) {
      console.error("HASS not available");
      return;
    }

    const inputNumberEntity = `input_number.${this.config.cardId}`;
    this._hass.callService("input_number", "set_value", {
      entity_id: inputNumberEntity,
      value: 0
    }).catch((error) => {
      console.error("Failed to reset input_number:", error);
    });
  }

  calcIndex(inputNumber) {
    return inputNumber - 1;
  }

  // Pagination setup and update methods
  setupPagination() {
    const paginationControl = this.shadowRoot.querySelector('.pagination-control');
    if (!paginationControl) return;

    // Clear existing pagination bullets
    paginationControl.innerHTML = '';

    // Get visible slides from DOM (after conditional cleanup)
    const visibleSlides = Array.from(this.shadowRoot.querySelectorAll('.slide'));

    // Create bullets only for visible cards
    visibleSlides.forEach((slide, visibleIndex) => {
      const logicalIndex = parseInt(slide.dataset.logicalIndex);
      const bullet = document.createElement('button');
      bullet.classList.add('pagination-bullet');
      bullet.dataset.logicalIndex = logicalIndex;
      bullet.dataset.visibleIndex = visibleIndex;
      bullet.setAttribute('aria-label', `Go to slide ${visibleIndex + 1}`);
      bullet.addEventListener('click', () => this.scrollToCard(logicalIndex));
      paginationControl.appendChild(bullet);
    });

    this.updatePagination();
  }

  updatePagination() {
    const paginationControl = this.shadowRoot.querySelector('.pagination-control');
    if (!paginationControl) return;

    const bullets = paginationControl.querySelectorAll('.pagination-bullet');
    bullets.forEach((bullet) => {
      // Compare by logical index stored in dataset, not array position
      const bulletLogicalIndex = parseInt(bullet.dataset.logicalIndex);
      if (bulletLogicalIndex === this.currentIndex) {
        bullet.classList.add('active');
        bullet.setAttribute('aria-current', 'true');
      } else {
        bullet.classList.remove('active');
        bullet.removeAttribute('aria-current');
      }
    });
  }

  // Navigation setup and methods
  setupNavigation() {
    const prevButton = this.shadowRoot.querySelector('.navigation-button.prev-horizontal, .navigation-button.prev-vertical');
    const nextButton = this.shadowRoot.querySelector('.navigation-button.next-horizontal, .navigation-button.next-vertical');
    if (prevButton) prevButton.addEventListener('click', () => this.navigate(-1));
    if (nextButton) nextButton.addEventListener('click', () => this.navigate(1));
  }

  navigate(direction) {
    // Get visible slides and their logical indexes
    const visibleSlides = Array.from(this.shadowRoot.querySelectorAll('.slide'));
    if (visibleSlides.length === 0) return;

    const visibleLogicalIndexes = visibleSlides.map(s => parseInt(s.dataset.logicalIndex));

    // Find current position in the visible list
    let currentPosition = visibleLogicalIndexes.indexOf(this.currentIndex);
    if (currentPosition === -1) currentPosition = 0;

    let newPosition;

    if (this.config.loop && visibleSlides.length >= 3) {
      // Wrap around for loop mode
      newPosition = currentPosition + direction;
      if (newPosition >= visibleSlides.length) {
        newPosition = 0;
      } else if (newPosition < 0) {
        newPosition = visibleSlides.length - 1;
      }
    } else {
      // Clamp to boundaries for non-loop mode
      newPosition = Math.max(0, Math.min(currentPosition + direction, visibleSlides.length - 1));
    }

    // Get the logical index at the new position
    const newLogicalIndex = visibleLogicalIndexes[newPosition];
    this.scrollToCard(newLogicalIndex);
  }

  // Card scrolling methods
  scrollToCard(index) {
    const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
    if (!slider) return;

    const isHorizontal = this.config.template === 'slider-horizontal';

    // Find the slide with the matching logical index
    const slides = Array.from(this.shadowRoot.querySelectorAll('.slide'));
    const targetSlide = slides.find(slide => parseInt(slide.dataset.logicalIndex) === index);

    if (!targetSlide) return;

    // Calculate scroll position to the target slide
    let scrollPosition = 0;
    for (const slide of slides) {
      if (slide === targetSlide) break;
      scrollPosition += isHorizontal ? slide.offsetWidth : slide.offsetHeight;
    }

    slider.scrollTo({
      [isHorizontal ? 'left' : 'top']: scrollPosition,
      behavior: 'smooth'
    });

    this.updateCurrentIndex();
    this.updatePagination();

    if (this.config.timer > 0) {
      this.resetTimer();
    }
  }

  scrollToCardByIndex(index) {
    return new Promise((resolve) => {
      const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
      if (!slider) {
        resolve();
        return;
      }
      const isHorizontal = this.config.template === 'slider-horizontal';
      const maxIndex = this._cards.length - 1;
      const safeIndex = Math.max(0, Math.min(Math.round(index), maxIndex));
      const scrollPosition = safeIndex * (isHorizontal ? slider.clientWidth : slider.clientHeight);
    
      const scrollEndHandler = () => {
        slider.removeEventListener('scrollend', scrollEndHandler);
        this.updatePagination();
        resolve();
      };
    
      slider.addEventListener('scrollend', scrollEndHandler);
    
      slider.scrollTo({
        [isHorizontal ? 'left' : 'top']: scrollPosition,
        behavior: 'smooth'
      });
    });
  }

  // Timer setup and reset methods
  setupTimer() {
    if (this.config.timer > 0) {
      this.resetTimer();
      const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
      slider.addEventListener('scroll', () => this.resetTimer());
      slider.addEventListener('click', () => this.resetTimer());
      slider.addEventListener('touchend', () => this.resetTimer());
    }
  }

  resetTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    this.timerInterval = setTimeout(() => {
      const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
      this.scrollToCard(0);
    }, this.config.timer * 1000);
  }

  // Remove empty slides (from conditional cards that evaluated to hidden)
  removeEmptySlides() {
    const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
    if (!slider) return;

    const slides = Array.from(this.shadowRoot.querySelectorAll('.slide'));
    let removedAny = false;

    slides.forEach((slide, domIndex) => {
      const card = slide.querySelector('.card-element');
      const logicalIndex = parseInt(slide.dataset.logicalIndex);

      // Only check cards that are configured as conditional
      const cardConfig = this.config.cards[logicalIndex];
      if (!cardConfig || cardConfig.type !== 'conditional') {
        return; // Skip non-conditional cards
      }

      // Check multiple ways to detect if conditional card is hidden
      let isEmpty = false;

      // Method 1: Check for hui-conditional-card element
      const conditionalElement = card.querySelector('hui-conditional-card');
      if (conditionalElement) {
        const computedStyle = window.getComputedStyle(conditionalElement);
        isEmpty = computedStyle.display === 'none';
      }

      // Method 2: Check if card has very small height (likely empty)
      if (!isEmpty && card.offsetHeight < 10) {
        isEmpty = true;
      }

      // Method 3: Check if card has no visible children
      if (!isEmpty && card.children.length === 0) {
        isEmpty = true;
      }

      // Method 4: Check shadowRoot of card element for empty content
      if (!isEmpty && card.shadowRoot) {
        const cardContent = card.shadowRoot.querySelector('*');
        if (!cardContent || cardContent.offsetHeight < 10) {
          isEmpty = true;
        }
      }

      if (isEmpty) {
        slide.remove();
        removedAny = true;
      }
    });

    // Only update if we actually removed slides
    if (removedAny) {
      const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
      const isHorizontal = this.config.template === 'slider-horizontal';

      // Force layout recalculation
      if (slider) {
        slider.offsetHeight; // Force reflow
      }

      // Update _cards array to only include visible cards
      const visibleSlides = Array.from(this.shadowRoot.querySelectorAll('.slide'));
      this._cards = visibleSlides.map(slide => slide.querySelector('.card-element')).filter(Boolean);

      // Update currentIndex if needed (in case current card was removed)
      if (this.currentIndex !== undefined) {
        // Check if current index still exists in visible slides
        const currentExists = visibleSlides.some(s => parseInt(s.dataset.logicalIndex) === this.currentIndex);
        if (!currentExists && visibleSlides.length > 0) {
          // Reset to first visible card
          this.currentIndex = parseInt(visibleSlides[0].dataset.logicalIndex);
        }
      } else if (visibleSlides.length > 0) {
        // Initialize currentIndex to first visible card
        this.currentIndex = parseInt(visibleSlides[0].dataset.logicalIndex);
      }

      // Reset scroll position to start (first visible card)
      if (slider) {
        // Disable smooth scrolling for instant position reset
        const originalBehavior = slider.style.scrollBehavior;
        slider.style.scrollBehavior = 'auto';

        if (isHorizontal) {
          slider.scrollLeft = 0;
        } else {
          slider.scrollTop = 0;
        }

        // Force another reflow
        slider.offsetHeight;

        // Restore smooth scrolling
        requestAnimationFrame(() => {
          slider.style.scrollBehavior = originalBehavior;
        });
      }

      // Re-setup pagination and looping with updated card count
      if (this.config.pagination) {
        this.setupPagination();
      }

      if (this.config.loop && this._cards.length >= 3) {
        this.setupLooping();
      }

      // Update pagination to reflect current state
      this.updatePagination();
    }
  }

  // Looping setup method
  setupLooping() {
    // Disconnect old observer if exists
    if (this.loopObserver) {
      this.loopObserver.disconnect();
      this.loopObserver = null;
    }

    const slider = this.shadowRoot.querySelector(`.${this.config.template}`);
    const slides = this.shadowRoot.querySelectorAll('.slide');

    if (slides.length < 3) return; // Only enable for 3+ cards

    const isHorizontal = this.config.template === 'slider-horizontal';

    // Listen for scrollend event (native, no delay)
    const handleScrollEnd = () => {
      const allSlides = Array.from(this.shadowRoot.querySelectorAll('.slide'));
      const currentFirst = allSlides[0];
      const currentLast = allSlides[allSlides.length - 1];

      // Get current scroll position
      const currentScroll = isHorizontal ? slider.scrollLeft : slider.scrollTop;

      // Calculate which slide is currently snapped/visible
      let currentSlideIndex = 0;
      let accumulatedSize = 0;
      for (let i = 0; i < allSlides.length; i++) {
        const slideSize = isHorizontal ? allSlides[i].offsetWidth : allSlides[i].offsetHeight;
        if (currentScroll < accumulatedSize + slideSize / 2) {
          currentSlideIndex = i;
          break;
        }
        accumulatedSize += slideSize;
      }

      const currentSlide = allSlides[currentSlideIndex];

      // Disable scroll-behavior temporarily for instant repositioning
      const originalBehavior = slider.style.scrollBehavior;
      slider.style.scrollBehavior = 'auto';

      // If snapped to last slide, move first to end
      if (currentSlide === currentLast) {
        const firstSlideSize = isHorizontal ? currentFirst.offsetWidth : currentFirst.offsetHeight;

        // Store the target scroll position before DOM manipulation
        const targetScroll = currentScroll - firstSlideSize;

        slider.appendChild(currentFirst);

        // Force immediate layout recalculation
        slider.offsetHeight;

        // Compensate scroll position
        if (isHorizontal) {
          slider.scrollLeft = targetScroll;
        } else {
          slider.scrollTop = targetScroll;
        }
      }
      // If snapped to first slide, move last to beginning
      else if (currentSlide === currentFirst) {
        const lastSlideSize = isHorizontal ? currentLast.offsetWidth : currentLast.offsetHeight;

        // Store the target scroll position before DOM manipulation
        const targetScroll = currentScroll + lastSlideSize;

        slider.prepend(currentLast);

        // Force immediate layout recalculation
        slider.offsetHeight;

        // Compensate scroll position
        if (isHorizontal) {
          slider.scrollLeft = targetScroll;
        } else {
          slider.scrollTop = targetScroll;
        }
      }

      // Restore smooth scrolling
      requestAnimationFrame(() => {
        slider.style.scrollBehavior = originalBehavior;
      });
    };

    // Use native scrollend event (no delay, triggers when snap completes)
    slider.addEventListener('scrollend', handleScrollEnd);
  }

  // Cleanup method
  disconnectedCallback() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.loopObserver) {
      this.loopObserver.disconnect();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
  }

  // Custom styles application method
  applyCustomStyles() {
    const style = document.createElement('style');
    style.textContent = Object.entries(this.config.custom_css)
      .map(([property, value]) => `#${this.cardId} { ${property}: ${value}; }`)
      .join('\n');
    this.shadowRoot.appendChild(style);
  }
}

customElements.define('css-swipe-card', CssSwipeCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "css-swipe-card",
  name: "CSS Swipe Card",
  description: "A custom swipe card and carousel"
});
