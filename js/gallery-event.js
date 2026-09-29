/* Renders a single gallery event page from data/gallery.json.
   Reads the event id from window.GFC_EVENT_ID (set inline on fixed pages)
   or from the ?event= query string (used by the generic gallery-event.html page). */
(function () {
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function getEventId() {
    if (window.GFC_EVENT_ID) return window.GFC_EVENT_ID;
    var params = new URLSearchParams(window.location.search);
    return params.get("event");
  }

  var eventId = getEventId();
  var grid = document.getElementById("event-gallery-grid");
  var titleEl = document.getElementById("event-title");
  var ledeEl = document.getElementById("event-lede");
  var crumbEl = document.getElementById("event-crumb");
  var ctaTitleEl = document.getElementById("event-cta-title");

  if (!eventId) {
    if (titleEl) titleEl.textContent = "Gallery item not found";
    return;
  }

  fetch("data/gallery.json").then(function (r) { return r.json(); }).then(function (data) {
    var ev = (data.events || []).find(function (e) { return e.id === eventId; });
    if (!ev) {
      if (titleEl) titleEl.textContent = "Gallery item not found";
      return;
    }

    document.title = (ev.subtitle || ev.title) + " | Gurkha FC Gallery";
    if (titleEl) titleEl.textContent = ev.subtitle || ev.title;
    if (ledeEl) ledeEl.textContent = ev.lede || "";
    if (crumbEl) crumbEl.textContent = ev.title;
    if (ctaTitleEl) ctaTitleEl.textContent = "Got photos from " + (ev.subtitle || ev.title) + "?";

    if (grid) {
      grid.innerHTML = "";
      if (ev.photos && ev.photos.length) {
        ev.photos.forEach(function (p) {
          var tile = el("div", { "class": "g-tile" });
          tile.appendChild(el("img", { src: p.src, alt: p.alt || (ev.subtitle || ev.title) }));
          grid.appendChild(tile);
        });
      } else {
        grid.appendChild(el("p", { style: "color:var(--slate);" }, "Photos from this event are coming soon."));
      }
    }
  }).catch(function (err) {
    console.error("Could not load gallery data", err);
    if (titleEl) titleEl.textContent = "Gallery item not found";
  });
})();
