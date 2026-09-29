/* Renders the Gallery page (tabs, collection cards, players) from data/gallery.json and data/players.json */
(function () {
  var CAT_GRADIENTS = [
    "linear-gradient(135deg, #0F2A57, #184691)",
    "linear-gradient(135deg, #EB2127, #A8161B)",
    "linear-gradient(135deg, #184691, #0F2A57)",
    "linear-gradient(135deg, #A8161B, #EB2127)"
  ];

  function gradientFor(index) {
    return CAT_GRADIENTS[index % CAT_GRADIENTS.length];
  }

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function buildThumb(ev, gradientIndex) {
    var thumb = el("div", { "class": "thumb" });
    if (ev.thumbStyle === "badge" && ev.thumb) {
      thumb.className = "thumb badge-thumb";
      thumb.appendChild(el("img", { src: ev.thumb, alt: (ev.subtitle || ev.title) + " badge" }));
    } else if (ev.thumb) {
      thumb.appendChild(el("img", { src: ev.thumb, alt: ev.subtitle || ev.title }));
    } else if (ev.photos && ev.photos.length) {
      thumb.appendChild(el("img", { src: ev.photos[0].src, alt: ev.photos[0].alt || ev.subtitle || ev.title }));
    } else {
      thumb.style.background = gradientFor(gradientIndex);
    }
    return thumb;
  }

  function renderTabs(data) {
    var tabsWrap = document.getElementById("gallery-tabs");
    var panelsWrap = document.getElementById("gallery-panels");
    if (!tabsWrap || !panelsWrap) return;

    var categories = data.categories || [];
    var events = data.events || [];

    categories.forEach(function (cat, i) {
      var isFirst = i === 0;
      var btn = el("button", {
        type: "button",
        "class": "tab-btn" + (isFirst ? " active" : ""),
        "data-tab": cat.id,
        role: "tab",
        "aria-selected": isFirst ? "true" : "false",
        id: "tab-btn-" + cat.id,
        "aria-controls": "tab-" + cat.id
      }, cat.label);
      tabsWrap.appendChild(btn);

      var panel = el("div", {
        "class": "tab-panel",
        id: "tab-" + cat.id,
        role: "tabpanel",
        "aria-labelledby": "tab-btn-" + cat.id
      });
      if (!isFirst) panel.setAttribute("hidden", "");

      var grid = el("div", { "class": "collection-grid" });
      var catEvents = events.filter(function (e) { return e.category === cat.id; });
      catEvents.forEach(function (ev, idx) {
        var card = el("a", { "class": "collection-card", href: "gallery-event.html?event=" + encodeURIComponent(ev.id) });
        card.appendChild(buildThumb(ev, idx));
        var info = el("div", { "class": "info" });
        info.appendChild(el("span", { "class": "cat" }, cat.label.toUpperCase()));
        info.appendChild(el("h3", {}, ev.title));
        info.appendChild(el("div", { "class": "count" }, "View photos →"));
        card.appendChild(info);
        grid.appendChild(card);
      });
      panel.appendChild(grid);
      panelsWrap.appendChild(panel);
    });

    // Players tab is appended last, after category tabs, inside the same containers
    var playersBtn = el("button", {
      type: "button", "class": "tab-btn", "data-tab": "players", role: "tab",
      "aria-selected": "false", id: "tab-btn-players", "aria-controls": "tab-players"
    }, "Players");
    tabsWrap.appendChild(playersBtn);

    var playersPanel = el("div", {
      "class": "tab-panel", id: "tab-players", role: "tabpanel", "aria-labelledby": "tab-btn-players"
    });
    playersPanel.setAttribute("hidden", "");
    var playerGrid = el("div", { "class": "player-grid" });
    playersPanel.appendChild(playerGrid);
    panelsWrap.appendChild(playersPanel);

    fetch("data/players.json").then(function (r) { return r.json(); }).then(function (data) {
      var players = data.players || [];
      var order = { "Keeper": 0, "Defender": 1, "Midfielder": 2, "Forward": 3 };
      players.sort(function (a, b) {
        var oa = order.hasOwnProperty(a.position) ? order[a.position] : 99;
        var ob = order.hasOwnProperty(b.position) ? order[b.position] : 99;
        return oa - ob;
      });
      players.forEach(function (p) {
        var card = el("div", { "class": "player-card" });
        var photo = el("div", { "class": "player-photo" });
        photo.appendChild(el("img", { src: p.photo, alt: p.name + ", " + p.position }));
        card.appendChild(photo);
        card.appendChild(el("div", { "class": "player-name" }, p.name));
        card.appendChild(el("div", { "class": "player-position" }, p.position));
        playerGrid.appendChild(card);
      });
    }).catch(function () {});

    if (window.GFC_initTabs) window.GFC_initTabs();
  }

  fetch("data/gallery.json").then(function (r) { return r.json(); }).then(renderTabs).catch(function (err) {
    console.error("Could not load gallery data", err);
  });
})();
