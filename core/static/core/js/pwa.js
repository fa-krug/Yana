// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/static/core/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            }, err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Database Module
const DB_NAME = 'YanaDB';
const DB_VERSION = 1;
const STORE_NAME = 'articles';

const db = {
    db: null,
    async open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                    store.createIndex('read', 'read', { unique: false });
                }
            };
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };
            request.onerror = (event) => reject(event.target.error);
        });
    },
    async putArticles(articles) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            articles.forEach(article => store.put(article));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e);
        });
    },
    async getAllArticles() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    },
    async deleteArticle(id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            store.delete(id);
            transaction.oncomplete = () => resolve();
        });
    },
    async updateReadStatus(id, status) {
        // We need to fetch, update, put
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const req = store.get(id);
            req.onsuccess = () => {
                const data = req.result;
                if (data) {
                    data.read = status;
                    store.put(data);
                }
                resolve();
            };
            req.onerror = reject;
        });
    }
};

// App Logic
const App = {
    articles: [], // In-memory sorted list of unread articles
    history: [], // Stack of read articles for "Back" functionality
    currentArticleIndex: 0,

    async init() {
        await db.open();
        this.showLoading();
        await this.sync();
        await this.loadFromDB();
        this.render();
        this.initGestures();
    },

    async sync() {
        try {
            const response = await fetch('/api/pwa/sync/');
            if (!response.ok) throw new Error('Sync failed');
            const data = await response.json();
            const serverArticles = data.articles;

            // Put to DB
            await db.putArticles(serverArticles);

            // Delete missing
            const localArticles = await db.getAllArticles();
            const serverIds = new Set(serverArticles.map(a => a.id));
            for (const local of localArticles) {
                if (!serverIds.has(local.id)) {
                    await db.deleteArticle(local.id);
                }
            }
        } catch (e) {
            console.error('Sync error:', e);
            // Continue with offline data
        }
    },

    async loadFromDB() {
        const all = await db.getAllArticles();
        // Sort by date desc (Newest first) or Asc?
        // User wants "First unread".
        // Let's assume standard feed behavior: Newest First.
        // But "First unread" implies chronological reading?
        // Usually, RSS readers sort Newest First.
        // Let's stick to Newest First for now.
        // Filter unread
        this.articles = all
            .filter(a => !a.read)
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        // If "downloads all" really means we should be able to browse read history too...
        // But "swipe left... marks current as read... next unread" implies a queue of unread.
        // "Swipe right... last item" implies history.
    },

    showLoading() {
        document.getElementById('app-container').innerHTML = '<div class="loading-screen">Loading...</div>';
    },

    render() {
        const container = document.getElementById('app-container');
        if (this.articles.length === 0) {
            container.innerHTML = `
                <div class="global-header">
                    <div style="width: 32px"></div>
                    <a href="/admin/" class="settings-link" target="_blank">Admin</a>
                </div>
                <div class="empty-state">No unread articles!</div>`;
            this.initPullToRefresh();
            return;
        }

        const article = this.articles[0]; // Current top of stack

        container.innerHTML = `
            <div class="global-header">
                <img src="${article.icon_url || '/static/core/img/icon.png'}" class="feed-icon" onerror="this.src='/static/core/img/icon.png'">
                <a href="/admin/" class="settings-link" target="_blank">Admin</a>
            </div>
            <div class="article-slider" id="slider">
                <div class="article-card active" id="card-current">
                    ${this.renderArticleContent(article)}
                </div>
                <div class="article-card next" id="card-next">
                     ${this.articles.length > 1 ? this.renderArticleContent(this.articles[1]) : ''}
                </div>
                 <div class="article-card prev" id="card-prev">
                     <!-- Populated dynamically -->
                </div>
            </div>
        `;
        this.initPullToRefresh();
    },

    renderArticleContent(article) {
        const hasPrev = this.history.length > 0;
        const hasNext = this.articles.length > 1;

        return `
            <div class="article-header-row">
                <h1 class="article-title"><a href="${article.url}" target="_blank">${article.title}</a></h1>
                <div class="nav-buttons">
                    <button class="nav-btn" data-action="prev" ${!hasPrev ? 'disabled' : ''}>&larr; Prev</button>
                    <button class="nav-btn" data-action="next" ${!hasNext ? 'disabled' : ''}>Next &rarr;</button>
                </div>
            </div>
            <div class="article-meta">${article.feed_name} • ${new Date(article.date).toLocaleDateString()}</div>
            <div class="article-content">${article.content}</div>
        `;
    },

    async markAsRead(article) {
        // Optimistic UI update
        // Call API
        fetch('/api/pwa/read/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': this.getCsrfToken()
            },
            body: JSON.stringify({ article_id: article.id })
        });

        // Update DB
        await db.updateReadStatus(article.id, true);
    },

    getCsrfToken() {
        return document.cookie.split('; ')
            .find(row => row.startsWith('csrftoken='))
            ?.split('=')[1];
    },

    initGestures() {
        let touchStartX = 0;
        let touchCurrentX = 0;
        const slider = document.getElementById('slider');
        if (!slider) return;

        const currentCard = document.getElementById('card-current');
        const nextCard = document.getElementById('card-next');
        const prevCard = document.getElementById('card-prev');

        // Populate prev card if history exists
        if (this.history.length > 0) {
            prevCard.innerHTML = this.renderArticleContent(this.history[this.history.length - 1]);
        }

        slider.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
        }, { passive: true });

        slider.addEventListener('touchmove', (e) => {
            touchCurrentX = e.touches[0].clientX;
            const diff = touchCurrentX - touchStartX;

            // Limit swipe based on availability
            // Left swipe (Next) -> Only if next exists
            if (diff < 0 && this.articles.length <= 1) return;
            // Right swipe (Prev) -> Only if history exists
            if (diff > 0 && this.history.length === 0) return;

            // Apply transform
            // We move the current card and the one appearing
            if (diff < 0) {
                // Moving Left (Next)
                currentCard.style.transform = `translateX(${diff}px)`;
                nextCard.style.transform = `translateX(${100 + (diff / window.innerWidth * 100)}%)`;
                nextCard.style.display = 'block';
            } else {
                // Moving Right (Prev)
                currentCard.style.transform = `translateX(${diff}px)`;
                prevCard.style.transform = `translateX(${-100 + (diff / window.innerWidth * 100)}%)`;
                prevCard.style.display = 'block';
            }

        }, { passive: true });

        slider.addEventListener('touchend', async (e) => {
            const diff = touchCurrentX - touchStartX;
            const threshold = window.innerWidth * 0.25; // 25% width

            currentCard.style.transition = 'transform 0.3s ease';
            nextCard.style.transition = 'transform 0.3s ease';
            prevCard.style.transition = 'transform 0.3s ease';

            if (diff < -threshold && this.articles.length > 1) {
                // Successful Next Swipe
                currentCard.style.transform = 'translateX(-100%)';
                nextCard.style.transform = 'translateX(0)';

                setTimeout(() => {
                    this.goToNext();
                }, 300);
            } else if (diff > threshold && this.history.length > 0) {
                // Successful Prev Swipe
                currentCard.style.transform = 'translateX(100%)';
                prevCard.style.transform = 'translateX(0)';

                setTimeout(() => {
                    this.goToPrev();
                }, 300);
            } else {
                // Revert
                currentCard.style.transform = 'translateX(0)';
                if (diff < 0) nextCard.style.transform = 'translateX(100%)';
                else prevCard.style.transform = 'translateX(-100%)';
            }

            // Reset variables
            touchStartX = 0;
            touchCurrentX = 0;
        });
        this.initNavButtons();
    },

    initNavButtons() {
        const navButtons = document.querySelectorAll('.nav-btn[data-action]');

        navButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action === 'prev' && this.history.length > 0) {
                    this.goToPrev();
                } else if (action === 'next' && this.articles.length > 1) {
                    this.goToNext();
                }
            });
        });
    },

    initPullToRefresh() {
        const header = document.querySelector('.app-header');
        if (!header) return;

        const container = document.getElementById('app-container');
        const spinner = document.querySelector('.spinner-icon');
        let touchStartY = 0;
        let touchStartX = 0;
        let isPulling = false;
        let isScroll = false;
        const PULL_THRESHOLD = 80;
        const MAX_PULL = 150;

        header.addEventListener('touchstart', (e) => {
            // Only if we are at the top of the content?
            // Since we are pulling the header, which is fixed at top, we are always at the top of the view.
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            isPulling = false;
            isScroll = false;
            container.style.transition = 'none';
        }, { passive: true });

        header.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = currentY - touchStartY;
            const diffX = currentX - touchStartX;

            // Check direction on first move
            if (!isPulling && !isScroll) {
                if (Math.abs(diffX) > Math.abs(diffY)) {
                    isScroll = true; // Horizontal swipe
                } else if (diffY > 0) {
                    isPulling = true; // Vertical pull
                }
            }

            if (isPulling && !isScroll) {
                if (e.cancelable) e.preventDefault(); // Prevent standard scroll if applicable
                const resistance = 0.5; // Dampen the pull
                const translate = Math.min(diffY * resistance, MAX_PULL);

                container.style.transform = `translateY(${translate}px)`;
                if (spinner) {
                    spinner.style.transform = `rotate(${translate * 2}deg)`;
                }
            }
        }, { passive: false }); // Changed to false to allow preventDefault

        header.addEventListener('touchend', async (e) => {
            if (!isPulling) return;

            const style = window.getComputedStyle(container);
            const matrix = new DOMMatrix(style.transform);
            const currentY = matrix.m42;

            container.style.transition = 'transform 0.3s ease';

            if (currentY > PULL_THRESHOLD) {
                // Refresh Triggered
                container.style.transform = 'translateY(60px)'; // Hold position
                if (spinner) spinner.style.animation = 'spin 1s linear infinite';

                try {
                    await this.handleRefresh();
                } catch (err) {
                    console.error('Refresh failed:', err);
                } finally {
                    // After refresh (or error)
                    container.style.transform = 'translateY(0)';
                    setTimeout(() => {
                        if (spinner) spinner.style.animation = ''; // Reset animation
                    }, 300);
                }
            } else {
                // Snap back
                container.style.transform = 'translateY(0)';
            }

            isPulling = false;
            isScroll = false;
            touchStartY = 0;
            touchStartX = 0;
        });
    },

    async handleRefresh() {
        console.log('Refreshing...');
        await this.sync();
        await this.loadFromDB();
        this.render();
    },

    goToNext() {
        const current = this.articles.shift(); // Remove current
        this.history.push(current); // Add to history
        this.markAsRead(current);
        this.render(); // Re-render with new top
        this.initGestures();
    },

    goToPrev() {
        const prev = this.history.pop(); // Remove from history
        // Mark as unread? Or keep read?
        // Usually going back doesn't toggle read status back.
        // But we need to put it back in the stack.
        this.articles.unshift(prev);
        this.render();
        this.initGestures();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
