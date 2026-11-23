/* KING Hoops — site interactions */
(function () {
  "use strict";
  document.documentElement.classList.remove("no-js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Sticky header state + back-to-top ---- */
  var header = document.querySelector(".header");
  var toTop = document.querySelector(".to-top");
  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle("is-scrolled", y > 10);
    if (toTop) toTop.classList.toggle("is-visible", y > 700);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" }); });

  /* ---- Mobile menu ---- */
  var toggle = document.querySelector(".menu-toggle");
  var scrim = document.querySelector(".scrim");
  function setMenu(open) {
    document.body.classList.toggle("menu-open", open);
    if (toggle) toggle.setAttribute("aria-expanded", String(open));
  }
  if (toggle) toggle.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
  if (scrim) scrim.addEventListener("click", function () { setMenu(false); });
  document.querySelectorAll(".nav a").forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll(".reveal, .reveal-stagger");
  if ("IntersectionObserver" in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { threshold: 0, rootMargin: "0px 0px -60px 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---- Count-up numbers ---- */
  var counters = document.querySelectorAll("[data-count]");
  function runCounter(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    var prefix = el.getAttribute("data-prefix") || "";
    var suffix = el.getAttribute("data-suffix") || "";
    if (reduceMotion) { el.textContent = prefix + target.toLocaleString() + suffix; return; }
    var start = null, dur = 1600;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = prefix + Math.round(target * eased).toLocaleString() + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { runCounter(entry.target); cio.unobserve(entry.target); }
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(runCounter);
  }

  /* ---- Testimonial slider buttons ---- */
  document.querySelectorAll("[data-slider]").forEach(function (wrap) {
    var track = wrap.querySelector(".t-track");
    wrap.querySelectorAll("[data-dir]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var card = track.querySelector(".t-card");
        var amount = card ? card.getBoundingClientRect().width + 24 : 400;
        track.scrollBy({ left: amount * parseInt(btn.getAttribute("data-dir"), 10), behavior: reduceMotion ? "auto" : "smooth" });
      });
    });
  });

  /* ---- Lightbox (images + videos) ---- */
  var lb = document.querySelector(".lightbox");
  if (lb) {
    var stage = lb.querySelector(".lightbox__stage");
    var countEl = lb.querySelector(".lb-count");
    var group = [], index = 0, lastFocus = null;

    function render() {
      var item = group[index];
      stage.innerHTML = "";
      var el;
      if (item.getAttribute("data-video")) {
        el = document.createElement("video");
        el.src = item.getAttribute("data-video");
        el.controls = true; el.autoplay = true; el.playsInline = true;
        var poster = item.querySelector("img");
        if (poster) el.poster = poster.currentSrc || poster.src;
      } else {
        el = document.createElement("img");
        el.src = item.getAttribute("data-full") || item.querySelector("img").src;
        el.alt = (item.querySelector("img") || {}).alt || "";
      }
      stage.appendChild(el);
      var multi = group.length > 1;
      lb.querySelector(".lb-prev").hidden = !multi;
      lb.querySelector(".lb-next").hidden = !multi;
      countEl.textContent = multi ? (index + 1) + " / " + group.length : "";
    }
    function open(item) {
      var name = item.getAttribute("data-group");
      group = name ? Array.prototype.slice.call(document.querySelectorAll('[data-group="' + name + '"]')) : [item];
      index = group.indexOf(item);
      lastFocus = document.activeElement;
      render();
      lb.classList.add("is-open");
      document.body.style.overflow = "hidden";
      lb.querySelector(".lb-close").focus();
    }
    function close() {
      lb.classList.remove("is-open");
      document.body.style.overflow = "";
      setTimeout(function () { stage.innerHTML = ""; }, 300);
      if (lastFocus) lastFocus.focus();
    }
    function go(d) { index = (index + d + group.length) % group.length; render(); }

    document.querySelectorAll("[data-lightbox]").forEach(function (item) {
      item.addEventListener("click", function (e) { e.preventDefault(); open(item); });
    });
    lb.querySelector(".lb-close").addEventListener("click", close);
    lb.querySelector(".lb-prev").addEventListener("click", function () { go(-1); });
    lb.querySelector(".lb-next").addEventListener("click", function () { go(1); });
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === stage) close(); });
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft" && group.length > 1) go(-1);
      if (e.key === "ArrowRight" && group.length > 1) go(1);
    });
    var touchX = null;
    lb.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (touchX === null || group.length < 2) return;
      var dx = e.changedTouches[0].clientX - touchX;
      if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      touchX = null;
    });
  }

  /* ---- Alumni class filter ---- */
  var filterWrap = document.querySelector("[data-filters]");
  if (filterWrap) {
    filterWrap.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      filterWrap.querySelectorAll("button").forEach(function (b) { b.classList.toggle("is-active", b === btn); b.setAttribute("aria-pressed", String(b === btn)); });
      var year = btn.getAttribute("data-filter");
      document.querySelectorAll(".alum").forEach(function (card) {
        card.classList.toggle("is-hidden", year !== "all" && card.getAttribute("data-class") !== year);
      });
    });
  }

  /* ---- Contact form → opens the visitor's email app ---- */
  var form = document.querySelector("[data-mailto-form]");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var f = form.elements;
      var name = (f.first.value + " " + f.last.value).trim();
      var subject = "Website inquiry" + (name ? " from " + name : "");
      var body = f.message.value + "\n\n— " + (name || "Website visitor") + "\n" + f.email.value;
      window.location.href = "mailto:" + form.getAttribute("data-to") + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      var note = form.querySelector(".form-note");
      if (note) note.textContent = "Your email app should open with your message ready to send. If it doesn't, email us directly at " + form.getAttribute("data-to") + ".";
    });
  }

  /* ---- Pause background hero video when off screen / reduced motion ---- */
  document.querySelectorAll(".hero video").forEach(function (v) {
    if (reduceMotion) { v.removeAttribute("autoplay"); v.pause(); }
  });

  /* ---- Footer year ---- */
  var yr = document.querySelector("[data-year]");
  if (yr) yr.textContent = new Date().getFullYear();
})();
