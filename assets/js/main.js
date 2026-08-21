/* ==========================================================================
   ALDEN & ROE - site behaviour
   Vanilla JS, no dependencies. All scroll work uses IntersectionObserver.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Theme ---------- */
  function initTheme() {
    var btns = $$('[data-theme-toggle]');
    if (!btns.length) return;
    var apply = function (mode) {
      document.documentElement.setAttribute('data-theme', mode);
      try { localStorage.setItem('ar-theme', mode); } catch (e) {}
      btns.forEach(function (b) {
        b.setAttribute('aria-label', mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
      });
    };
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var current = document.documentElement.getAttribute('data-theme');
        if (!current) {
          current = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        apply(current === 'dark' ? 'light' : 'dark');
      });
    });
  }

  /* ---------- Broken-image net -----------
     Any remote photo that fails resolves to a same-ratio fallback so the
     layout never ships with a blank frame. */
  function initImageFallback() {
    $$('img').forEach(function (img) {
      img.addEventListener('error', function handle() {
        img.removeEventListener('error', handle);
        var w = img.getAttribute('width') || img.clientWidth || 800;
        var h = img.getAttribute('height') || img.clientHeight || 1000;
        var seed = (img.getAttribute('data-seed') || img.alt || 'alden-roe')
          .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'alden-roe';
        img.src = 'https://picsum.photos/seed/' + seed + '/' + Math.round(w) + '/' + Math.round(h);
      }, { once: false });
    });
  }

  /* ---------- Sticky header shadow ---------- */
  function initHeader() {
    var header = $('.header');
    if (!header) return;
    var sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;';
    document.body.prepend(sentinel);
    if (!('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (entries) {
      header.classList.toggle('is-stuck', !entries[0].isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  }

  /* ---------- Scroll reveals ---------- */
  function initReveals() {
    var targets = $$('.reveal, .reveal-mask, .reveal-zoom');
    if (!targets.length) return;
    var showAll = function () { targets.forEach(function (el) { el.classList.add('is-in'); }); };
    if (!('IntersectionObserver' in window) || reduceMotion) { showAll(); return; }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });

    targets.forEach(function (el) { io.observe(el); });
    // Watchdog: nothing ever stays invisible.
    setTimeout(showAll, 3500);
  }

  /* ---------- Generic panel opener (mobile nav, filters, cart) ---------- */
  var backdrop = null;
  var openPanels = [];

  function ensureBackdrop() {
    if (backdrop) return backdrop;
    backdrop = $('.backdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.className = 'backdrop';
      document.body.appendChild(backdrop);
    }
    backdrop.addEventListener('click', closeAllPanels);
    return backdrop;
  }

  function openPanel(panel, trigger) {
    if (!panel) return;
    var wasInert = panel.hasAttribute('inert');
    ensureBackdrop().classList.add('is-open');
    panel.classList.add('is-open');
    panel.removeAttribute('inert');
    document.body.classList.add('is-locked');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    openPanels.push({ panel: panel, trigger: trigger, wasInert: wasInert });
    var focusable = panel.querySelector('button, a[href], input, select, textarea');
    if (focusable) focusable.focus({ preventScroll: true });
  }

  function closeAllPanels() {
    openPanels.forEach(function (item) {
      item.panel.classList.remove('is-open');
      if (item.trigger) {
        item.trigger.setAttribute('aria-expanded', 'false');
        item.trigger.focus({ preventScroll: true });
      }
      // Restore inert only after the slide-out finishes, so focus is not
      // yanked mid-transition.
      if (item.wasInert) {
        setTimeout(function () {
          if (!item.panel.classList.contains('is-open')) item.panel.setAttribute('inert', '');
        }, 450);
      }
    });
    openPanels = [];
    if (backdrop) backdrop.classList.remove('is-open');
    document.body.classList.remove('is-locked');
  }

  function initPanels() {
    $$('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var panel = document.getElementById(btn.getAttribute('data-open'));
        openPanel(panel, btn);
      });
    });
    $$('[data-close]').forEach(function (btn) {
      btn.addEventListener('click', closeAllPanels);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAllPanels();
    });
  }

  /* ---------- Toast ---------- */
  var toastTimer;
  function toast(message) {
    var el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.className = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('is-open');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-open'); }, 3600);
  }

  /* ---------- Cart (localStorage) ---------- */
  var CART_KEY = 'ar-cart-v1';

  function readCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
    catch (e) { return []; }
  }
  function writeCart(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
    paintCartCount();
    paintDrawer();
  }
  function cartCount() {
    return readCart().reduce(function (n, i) { return n + i.qty; }, 0);
  }
  function cartSubtotal() {
    return readCart().reduce(function (n, i) { return n + i.price * i.qty; }, 0);
  }
  function money(n) {
    return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function addToCart(item) {
    var items = readCart();
    var key = item.id + '|' + (item.size || '') + '|' + (item.color || '');
    var found = items.filter(function (i) { return i.key === key; })[0];
    if (found) { found.qty += item.qty || 1; }
    else {
      items.push({
        key: key, id: item.id, name: item.name, price: item.price,
        image: item.image, size: item.size || '', color: item.color || '',
        qty: item.qty || 1, url: item.url || 'product.html'
      });
    }
    writeCart(items);
  }

  function paintCartCount() {
    var n = cartCount();
    $$('[data-cart-count]').forEach(function (el) {
      el.textContent = n;
      el.hidden = n === 0;
    });
  }

  function lineMarkup(item) {
    return '' +
      '<div class="cart-line" data-key="' + item.key + '">' +
        '<img src="' + item.image + '" alt="' + item.name + '" width="92" height="123" loading="lazy" data-seed="' + item.id + '">' +
        '<div>' +
          '<a class="cart-line__name" href="' + item.url + '">' + item.name + '</a>' +
          '<p class="cart-line__meta">' + (item.color ? item.color : '') + (item.size ? ' / Size ' + item.size : '') + '</p>' +
          '<div class="cart-line__actions">' +
            '<div class="qty">' +
              '<button type="button" data-line-dec aria-label="Decrease quantity of ' + item.name + '">&minus;</button>' +
              '<input type="number" min="1" max="10" value="' + item.qty + '" aria-label="Quantity of ' + item.name + '" data-line-qty>' +
              '<button type="button" data-line-inc aria-label="Increase quantity of ' + item.name + '">+</button>' +
            '</div>' +
            '<button type="button" class="link-line" data-line-remove>Remove</button>' +
          '</div>' +
        '</div>' +
        '<p class="cart-line__price">' + money(item.price * item.qty) + '</p>' +
      '</div>';
  }

  function paintDrawer() {
    var body = $('#cart-drawer-body');
    if (body) {
      var items = readCart();
      if (!items.length) {
        body.innerHTML = '<div class="empty-state mt-4"><h3>Your bag is empty</h3>' +
          '<p>Nothing here yet. Browse the current collection and pieces you add will appear in this bag.</p>' +
          '<a class="btn btn--solid" href="shop.html">Shop the collection</a></div>';
      } else {
        body.innerHTML = items.map(lineMarkup).join('');
      }
    }
    var sub = $('[data-cart-subtotal]');
    if (sub) sub.textContent = money(cartSubtotal());
    paintCartPage();
  }

  function paintCartPage() {
    var wrap = $('#cart-page-lines');
    if (!wrap) return;
    var items = readCart();
    var summary = $('#cart-summary');
    if (!items.length) {
      wrap.innerHTML = '<div class="empty-state"><h3>Your bag is empty</h3>' +
        '<p>You have not added anything yet. Start with new arrivals or browse the full collection.</p>' +
        '<a class="btn btn--solid" href="shop.html">Shop the collection</a></div>';
      if (summary) summary.hidden = true;
      return;
    }
    if (summary) summary.hidden = false;
    wrap.innerHTML = items.map(lineMarkup).join('');
    var subtotal = cartSubtotal();
    var shipping = subtotal >= 150 || subtotal === 0 ? 0 : 8.95;
    var tax = subtotal * 0.0875;
    var set = function (sel, val) { var el = $(sel); if (el) el.textContent = val; };
    set('[data-sum-subtotal]', money(subtotal));
    set('[data-sum-shipping]', shipping === 0 ? 'Free' : money(shipping));
    set('[data-sum-tax]', money(tax));
    set('[data-sum-total]', money(subtotal + shipping + tax));
  }

  function initCart() {
    paintCartCount();
    paintDrawer();

    document.addEventListener('click', function (e) {
      var addBtn = e.target.closest('[data-add-to-cart]');
      if (addBtn) {
        e.preventDefault();
        var scope = addBtn.closest('[data-product]') || document;
        var sizeBtn = scope.querySelector('.size[aria-pressed="true"]');
        var colorBtn = scope.querySelector('.swatch[aria-pressed="true"]');
        var needsSize = !!scope.querySelector('.size');
        if (needsSize && !sizeBtn) {
          var note = scope.querySelector('[data-size-error]');
          if (note) note.hidden = false;
          toast('Choose a size before adding to bag.');
          return;
        }
        var qtyInput = scope.querySelector('[data-qty-input]');
        addToCart({
          id: addBtn.getAttribute('data-id'),
          name: addBtn.getAttribute('data-name'),
          price: parseFloat(addBtn.getAttribute('data-price')),
          image: addBtn.getAttribute('data-image'),
          url: addBtn.getAttribute('data-url') || 'product.html',
          size: sizeBtn ? sizeBtn.textContent.trim() : '',
          color: colorBtn ? colorBtn.getAttribute('data-color') : '',
          qty: qtyInput ? Math.max(1, parseInt(qtyInput.value, 10) || 1) : 1
        });
        toast(addBtn.getAttribute('data-name') + ' added to your bag.');
        var drawer = $('#cart-drawer');
        if (drawer && addBtn.hasAttribute('data-open-drawer')) openPanel(drawer, $('[data-open="cart-drawer"]'));
        return;
      }

      var line = e.target.closest('.cart-line');
      if (!line) return;
      var key = line.getAttribute('data-key');
      var items = readCart();
      var item = items.filter(function (i) { return i.key === key; })[0];
      if (!item) return;

      if (e.target.closest('[data-line-remove]')) {
        writeCart(items.filter(function (i) { return i.key !== key; }));
        toast('Removed from your bag.');
      } else if (e.target.closest('[data-line-inc]')) {
        item.qty = Math.min(10, item.qty + 1); writeCart(items);
      } else if (e.target.closest('[data-line-dec]')) {
        item.qty = Math.max(1, item.qty - 1); writeCart(items);
      }
    });

    document.addEventListener('change', function (e) {
      var input = e.target.closest('[data-line-qty]');
      if (!input) return;
      var line = input.closest('.cart-line');
      var items = readCart();
      var item = items.filter(function (i) { return i.key === line.getAttribute('data-key'); })[0];
      if (!item) return;
      item.qty = Math.min(10, Math.max(1, parseInt(input.value, 10) || 1));
      writeCart(items);
    });
  }

  /* ---------- Option pickers (size, color, quantity) ---------- */
  function initOptions() {
    document.addEventListener('click', function (e) {
      var opt = e.target.closest('.size, .swatch');
      if (opt && !opt.disabled) {
        var group = opt.parentElement;
        $$('.size, .swatch', group).forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        opt.setAttribute('aria-pressed', 'true');
        var scope = opt.closest('[data-product]');
        var note = scope && scope.querySelector('[data-size-error]');
        if (note) note.hidden = true;
        if (opt.classList.contains('swatch')) {
          var label = scope && scope.querySelector('[data-color-label]');
          if (label) label.textContent = opt.getAttribute('data-color');
        }
      }

      var step = e.target.closest('[data-qty-step]');
      if (step) {
        var input = step.parentElement.querySelector('[data-qty-input]');
        var dir = parseInt(step.getAttribute('data-qty-step'), 10);
        input.value = Math.min(10, Math.max(1, (parseInt(input.value, 10) || 1) + dir));
      }
    });
  }

  /* ---------- Accordions ---------- */
  function initAccordions() {
    $$('.accordion__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* ---------- Product gallery ---------- */
  function initGallery() {
    var main = $('#gallery-main');
    if (!main) return;
    $$('.gallery__thumbs button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.gallery__thumbs button').forEach(function (b) { b.setAttribute('aria-current', 'false'); });
        btn.setAttribute('aria-current', 'true');
        var img = btn.querySelector('img');
        main.src = img.getAttribute('data-full') || img.src;
        main.alt = img.alt;
      });
    });
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    var box = $('#lightbox');
    if (!box) return;
    var boxImg = $('#lightbox-img');
    var openBox = function (src, alt) {
      boxImg.src = src; boxImg.alt = alt;
      box.classList.add('is-open');
      document.body.classList.add('is-locked');
      $('.lightbox__close', box).focus({ preventScroll: true });
    };
    $$('[data-lightbox]').forEach(function (el) {
      el.addEventListener('click', function () {
        var img = el.tagName === 'IMG' ? el : el.querySelector('img');
        openBox(img.src, img.alt);
      });
    });
    var closeBox = function () { box.classList.remove('is-open'); document.body.classList.remove('is-locked'); };
    $('.lightbox__close', box).addEventListener('click', closeBox);
    box.addEventListener('click', function (e) { if (e.target === box) closeBox(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBox(); });
  }

  /* ---------- Shop filtering + sorting ---------- */
  function initShop() {
    var grid = $('#product-grid');
    if (!grid) return;
    var cards = $$('.card', grid);
    var countEl = $('[data-result-count]');
    var empty = $('#shop-empty');
    var state = { category: 'all', size: 'all', price: 'all' };

    var matches = function (card) {
      if (state.category !== 'all' && card.getAttribute('data-category') !== state.category) return false;
      if (state.size !== 'all' && (card.getAttribute('data-sizes') || '').split(',').indexOf(state.size) === -1) return false;
      if (state.price !== 'all') {
        var p = parseFloat(card.getAttribute('data-price'));
        if (state.price === 'under200' && p >= 200) return false;
        if (state.price === '200to400' && (p < 200 || p > 400)) return false;
        if (state.price === 'over400' && p <= 400) return false;
      }
      return true;
    };

    var apply = function () {
      var shown = 0;
      cards.forEach(function (card) {
        var ok = matches(card);
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (countEl) countEl.textContent = shown + (shown === 1 ? ' piece' : ' pieces');
      if (empty) empty.hidden = shown !== 0;
    };

    $$('[data-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-filter');
        var val = btn.getAttribute('data-value');
        state[key] = val;
        $$('[data-filter="' + key + '"]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
        btn.setAttribute('aria-pressed', 'true');
        apply();
      });
    });

    var clear = $('[data-filter-clear]');
    if (clear) {
      clear.addEventListener('click', function () {
        state = { category: 'all', size: 'all', price: 'all' };
        $$('[data-filter]').forEach(function (b) {
          b.setAttribute('aria-pressed', b.getAttribute('data-value') === 'all' ? 'true' : 'false');
        });
        apply();
      });
    }

    var sort = $('#sort');
    if (sort) {
      sort.addEventListener('change', function () {
        var mode = sort.value;
        var sorted = cards.slice().sort(function (a, b) {
          var pa = parseFloat(a.getAttribute('data-price'));
          var pb = parseFloat(b.getAttribute('data-price'));
          if (mode === 'price-asc') return pa - pb;
          if (mode === 'price-desc') return pb - pa;
          if (mode === 'name') return a.getAttribute('data-name').localeCompare(b.getAttribute('data-name'));
          return parseInt(a.getAttribute('data-order'), 10) - parseInt(b.getAttribute('data-order'), 10);
        });
        sorted.forEach(function (c) { grid.appendChild(c); });
      });
    }

    apply();
  }

  /* ---------- Forms ---------- */
  function initForms() {
    $$('form[data-validate]').forEach(function (form) {
      form.setAttribute('novalidate', '');
      var status = form.querySelector('.form-status');

      var setError = function (field, message) {
        var wrap = field.closest('.field') || field.parentElement;
        wrap.classList.add('is-invalid');
        field.setAttribute('aria-invalid', 'true');
        var err = wrap.querySelector('.err');
        if (err && message) err.textContent = message;
      };
      var clearError = function (field) {
        var wrap = field.closest('.field') || field.parentElement;
        wrap.classList.remove('is-invalid');
        field.removeAttribute('aria-invalid');
      };

      var check = function (field) {
        var val = (field.value || '').trim();
        if (field.hasAttribute('required') && !val) {
          setError(field, 'This field is required.'); return false;
        }
        if (field.type === 'email' && val && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(val)) {
          setError(field, 'Enter a valid email address, for example ava@example.com.'); return false;
        }
        if (field.type === 'checkbox' && field.hasAttribute('required') && !field.checked) {
          setError(field, 'Please tick this box to continue.'); return false;
        }
        clearError(field);
        return true;
      };

      $$('input, textarea, select', form).forEach(function (field) {
        field.addEventListener('blur', function () { if (field.value || field.hasAttribute('required')) check(field); });
        field.addEventListener('input', function () {
          if ((field.closest('.field') || field.parentElement).classList.contains('is-invalid')) check(field);
        });
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var fields = $$('input, textarea, select', form).filter(function (f) { return f.type !== 'hidden' && f.type !== 'submit'; });
        var valid = true;
        fields.forEach(function (f) {
          if (f.type === 'checkbox') {
            if (f.hasAttribute('required') && !f.checked) { setError(f, 'Please tick this box to continue.'); valid = false; }
            else clearError(f);
          } else if (!check(f)) { valid = false; }
        });

        if (!valid) {
          if (status) {
            status.className = 'form-status form-status--err is-visible';
            status.textContent = 'Please correct the highlighted fields and try again.';
          }
          var firstBad = form.querySelector('[aria-invalid="true"]');
          if (firstBad) firstBad.focus();
          return;
        }

        var btn = form.querySelector('[type="submit"]');
        var label = btn ? btn.textContent : '';
        if (btn) { btn.setAttribute('aria-disabled', 'true'); btn.textContent = 'Sending...'; }

        // Demo build: no backend is wired. Replace this block with a real
        // POST to your order or contact endpoint before going live.
        setTimeout(function () {
          if (btn) { btn.removeAttribute('aria-disabled'); btn.textContent = label; }
          if (status) {
            status.className = 'form-status form-status--ok is-visible';
            status.textContent = form.getAttribute('data-success') ||
              'Thank you. Our team will reply within one business day.';
          }
          form.reset();
        }, 900);
      });
    });
  }

  /* ---------- Cookie consent ---------- */
  function initCookies() {
    var bar = $('#cookiebar');
    if (!bar) return;
    var stored;
    try { stored = localStorage.getItem('ar-consent'); } catch (e) { stored = 'set'; }
    if (stored) return;
    setTimeout(function () { bar.classList.add('is-open'); }, 1200);
    $$('[data-consent]', bar).forEach(function (btn) {
      btn.addEventListener('click', function () {
        try { localStorage.setItem('ar-consent', btn.getAttribute('data-consent')); } catch (e) {}
        bar.classList.remove('is-open');
      });
    });
  }

  /* ---------- Misc ---------- */
  function initMisc() {
    $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });

    // Reveal stagger index without hand-writing delays in markup.
    $$('[data-stagger]').forEach(function (group) {
      $$('.reveal', group).forEach(function (el, i) {
        el.style.setProperty('--d', Math.min(i * 70, 420) + 'ms');
      });
    });
  }

  function init() {
    initTheme();
    initImageFallback();
    initHeader();
    initReveals();
    initPanels();
    initCart();
    initOptions();
    initAccordions();
    initGallery();
    initLightbox();
    initShop();
    initForms();
    initCookies();
    initMisc();
    window.ARToast = toast;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
