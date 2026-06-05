// ── Hash Router ──
// Simple client-side routing using hash fragments

class Router {
  constructor() {
    this.routes = new Map();
    this.currentPage = null;
    this.onChange = null;

    window.addEventListener('hashchange', () => this.handleRoute());
  }

  register(name, handler) {
    this.routes.set(name, handler);
  }

  navigate(page) {
    window.location.hash = page;
  }

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const page = this.routes.has(hash) ? hash : 'dashboard';

    if (this.currentPage === page) return;

    // Deactivate current page
    if (this.currentPage) {
      const currentEl = document.getElementById(`page-${this.currentPage}`);
      if (currentEl) currentEl.classList.remove('active');
    }

    // Activate new page
    this.currentPage = page;
    const newEl = document.getElementById(`page-${page}`);
    if (newEl) newEl.classList.add('active');

    // Update sidebar
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update header title
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      const sidebarItem = document.querySelector(`.sidebar-item[data-page="${page}"]`);
      titleEl.textContent = sidebarItem?.dataset.title || page;
    }

    // Call page handler
    const handler = this.routes.get(page);
    if (handler) handler();

    // Notify listeners
    if (this.onChange) this.onChange(page);
  }

  init() {
    this.handleRoute();
  }

  getCurrentPage() {
    return this.currentPage;
  }
}

const router = new Router();
export default router;
