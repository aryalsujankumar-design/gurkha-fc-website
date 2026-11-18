/* GFC Cup — live scores & fixtures page. Renders everything from data/gfccup.json:
   Fixtures (by time slot), Group tables, Knockouts, Top scorers, Teams and Rules. */
(function () {
  var KNOCKOUT_ORDER = { "Quarter Final": 0, "Semi Final": 1, "Final": 2 };
  var DATA_URL = "data/gfccup.json";
  var REFRESH_MS = 60000;
  var SAVE_URL = "/api/cup-state";
  var org = { on: false, pin: "", dirty: false, draft: {} };

  var state = { data: null, raw: "", lastModified: "", activeTab: "teams", teamFilter: "" };

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function hasScore(f) {
    return f.score1 !== null && f.score1 !== undefined && f.score1 !== "" &&
           f.score2 !== null && f.score2 !== undefined && f.score2 !== "";
  }

  // ---- Dates & times ------------------------------------------------------------------
  function parseMinutes(t) {
    var m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i.exec(t || "");
    if (!m) return null;
    var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0;
    var ap = m[3] ? m[3].toLowerCase() : "";
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    return h * 60 + min;
  }

  function fmtMinutes(total) {
    total = ((total % 1440) + 1440) % 1440;
    var h = Math.floor(total / 60), m = total % 60;
    var ap = h >= 12 ? "PM" : "AM";
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ":" + (m < 10 ? "0" : "") + m + " " + ap;
  }

  function sortKey(f, idx) {
    var d = Date.parse(f.date || "");
    var t = parseMinutes(f.time);
    return [isNaN(d) ? 0 : d, t === null ? 0 : t, idx];
  }

  function cmpKey(a, b) {
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
  }

  // ---- Teams ----------------------------------------------------------------------------
  // Fixtures/goals/cards reference a team by its fixed Slot (e.g. "A1"); this lookup always
  // gives back the CURRENT club name, logo and group — even after the club is renamed.
  function buildTeamMeta(groups) {
    var byId = {}, byName = {}, list = [];
    (groups || []).forEach(function (g) {
      (g.teams || []).forEach(function (t) {
        if (!t) return;
        var id = t.id || t.name;
        if (!id) return;
        var meta = { id: id, name: t.name || id, logo: t.logo || "", group: g.id, groupLabel: g.label || ("Group " + g.id), team: t };
        byId[id] = meta;
        list.push(meta);
        if (t.name) byName[t.name.trim().toLowerCase()] = meta;
      });
    });
    return { byId: byId, byName: byName, list: list };
  }

  function lookupTeam(ref, teamMeta) {
    if (!ref) return null;
    ref = String(ref).trim();
    if (teamMeta.byId[ref]) return teamMeta.byId[ref];
    return teamMeta.byName[ref.toLowerCase()] || null;
  }

  function computeStandings(group, fixtures, teamMeta) {
    var stats = {};
    var order = 0;

    (group.teams || []).forEach(function (t) {
      var id = t && (t.id || t.name);
      if (!id) return;
      stats[id] = { id: id, order: order++, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    });

    function slotId(ref) {
      var found = lookupTeam(ref, teamMeta);
      return found ? found.id : ref;
    }

    fixtures.forEach(function (f) {
      if (f.stage !== "Group Stage" || f.group !== group.id) return;
      if (!hasScore(f)) return;
      var s1 = Number(f.score1), s2 = Number(f.score2);
      var id1 = slotId(f.team1), id2 = slotId(f.team2);
      if (!stats[id1]) stats[id1] = { id: id1, order: order++, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      if (!stats[id2]) stats[id2] = { id: id2, order: order++, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      var a = stats[id1], b = stats[id2];
      a.p++; b.p++;
      a.gf += s1; a.ga += s2;
      b.gf += s2; b.ga += s1;
      if (s1 > s2) { a.w++; a.pts += 3; b.l++; }
      else if (s1 < s2) { b.w++; b.pts += 3; a.l++; }
      else { a.d++; b.d++; a.pts += 1; b.pts += 1; }
    });

    var rows = Object.keys(stats).map(function (k) {
      var r = stats[k];
      r.gd = r.gf - r.ga;
      var meta = teamMeta.byId[r.id];
      r.displayName = meta ? meta.name : r.id;
      return r;
    });

    rows.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.order - b.order;
    });

    return rows;
  }

  // Resolves a team slot that may be a literal Slot ID / name, or a qualifier phrase like
  // "Winner Group A", "Runner-up Group B", or "Winner qf1". Returns { display, resolvedId, pending }.
  function resolveTeamRef(ref, groups, fixtures, teamMeta, depth) {
    ref = (ref || "").trim();
    if (!ref) return { display: "TBD", resolvedId: null, pending: true };
    depth = depth || 0;
    if (depth > 6) return { display: ref, resolvedId: null, pending: true };

    var m = /^Winner\s+Group\s+([A-Za-z0-9]+)$/i.exec(ref);
    if (m) return resolveGroupRank(m[1], 0, groups, fixtures, teamMeta);

    m = /^Runner-?\s?up\s+Group\s+([A-Za-z0-9]+)$/i.exec(ref);
    if (m) return resolveGroupRank(m[1], 1, groups, fixtures, teamMeta);

    m = /^Winner\s+(.+)$/i.exec(ref);
    if (m) {
      var fixtureId = m[1].trim().toLowerCase();
      var f = fixtures.filter(function (x) { return x.id && x.id.toLowerCase() === fixtureId; })[0];
      if (!f) return { display: ref, resolvedId: null, pending: true };
      if (!hasScore(f)) return { display: ref + " (TBD)", resolvedId: null, pending: true };
      var s1 = Number(f.score1), s2 = Number(f.score2);
      if (s1 === s2) return { display: ref + " (draw — TBD)", resolvedId: null, pending: true };
      return resolveTeamRef(s1 > s2 ? f.team1 : f.team2, groups, fixtures, teamMeta, depth + 1);
    }

    var found = lookupTeam(ref, teamMeta);
    return { display: found ? found.name : ref, resolvedId: found ? found.id : ref, pending: false };
  }

  function resolveGroupRank(groupId, rankIndex, groups, fixtures, teamMeta) {
    var label = (rankIndex === 0 ? "Winner Group " : "Runner-up Group ") + groupId;
    var g = (groups || []).filter(function (x) { return x.id === groupId; })[0];
    if (!g) return { display: label + " (TBD)", resolvedId: null, pending: true };

    var groupFixtures = fixtures.filter(function (f) { return f.stage === "Group Stage" && f.group === groupId; });
    var allPlayed = groupFixtures.length > 0 && groupFixtures.every(hasScore);
    if (!allPlayed) return { display: label + " (TBD)", resolvedId: null, pending: true };

    var rows = computeStandings(g, fixtures, teamMeta);
    if (rows.length <= rankIndex) return { display: label + " (TBD)", resolvedId: null, pending: true };

    var row = rows[rankIndex];
    return { display: row.displayName, resolvedId: row.id, pending: false };
  }

  // ---- Stats ----------------------------------------------------------------------------
  function computeTopScorers(fixtures, teamMeta) {
    var stats = {};
    fixtures.forEach(function (f) {
      (f.goals || []).forEach(function (g) {
        if (!g.player) return;
        var found = lookupTeam(g.team, teamMeta);
        var teamRef = found ? found.id : (g.team || "");
        var key = g.player + "||" + teamRef;
        if (!stats[key]) stats[key] = { player: g.player, team: teamRef, goals: 0 };
        stats[key].goals += Number(g.goals) || 0;
      });
    });
    var rows = Object.keys(stats).map(function (k) { return stats[k]; });
    rows.sort(function (a, b) {
      if (b.goals !== a.goals) return b.goals - a.goals;
      return a.player.localeCompare(b.player);
    });
    return rows;
  }

  function computeCards(fixtures, teamMeta) {
    var stats = {};
    fixtures.forEach(function (f) {
      (f.cards || []).forEach(function (c) {
        if (!c.player) return;
        var found = lookupTeam(c.team, teamMeta);
        var teamRef = found ? found.id : (c.team || "");
        var key = c.player + "||" + teamRef;
        if (!stats[key]) stats[key] = { player: c.player, team: teamRef, yellow: 0, red: 0 };
        if (c.type === "Red") stats[key].red += 1;
        else stats[key].yellow += 1;
      });
    });
    var rows = Object.keys(stats).map(function (k) { return stats[k]; });
    rows.sort(function (a, b) {
      if (b.red !== a.red) return b.red - a.red;
      if (b.yellow !== a.yellow) return b.yellow - a.yellow;
      return a.player.localeCompare(b.player);
    });
    return rows;
  }

  // ---- Small UI pieces ---------------------------------------------------------------------
  function profileHref(meta) {
    return "club-profile.html?team=" + encodeURIComponent(meta.id) + "&group=" + encodeURIComponent(meta.group);
  }

  // Round crest: the club logo if there is one, otherwise a navy disc with the team's slot code.
  function crest(meta, pendingLabel) {
    if (meta && meta.logo) {
      var img = el("img", { "class": "cup-crest", src: meta.logo, alt: "" });
      // If the logo file can't be loaded, fall back to the slot-code disc instead of a broken image.
      img.addEventListener("error", function () {
        var c = el("span", { "class": "cup-crest cup-crest-text" });
        c.textContent = meta.id;
        if (img.parentNode) img.parentNode.replaceChild(c, img);
      });
      return img;
    }
    var c = el("span", { "class": "cup-crest cup-crest-text" + (meta ? "" : " cup-crest-pending") });
    c.textContent = meta ? meta.id : (pendingLabel || "?");
    return c;
  }

  // Inline logo + name (used in tables). ref is a Slot ID, or a raw name that matched nothing.
  function teamBadge(ref, teamMeta) {
    var meta = teamMeta.byId[ref] || lookupTeam(ref, teamMeta);
    var label = meta ? meta.name : ref;
    var span = el("span", { "class": "team-name-badge" });
    span.appendChild(crest(meta));
    if (meta) {
      span.appendChild(el("a", { "class": "team-link", href: profileHref(meta) }, esc(label)));
    } else {
      span.appendChild(el("span", {}, esc(label)));
    }
    return span;
  }

  // One side of a match card: resolved team (name + crest, linked) or pending qualifier text.
  function matchSide(ref, ctx, side) {
    var resolved = resolveTeamRef(ref, ctx.groups, ctx.fixtures, ctx.teamMeta, 0);
    var wrap = el("div", { "class": "cup-side cup-side-" + side });
    var meta = (!resolved.pending && resolved.resolvedId) ? ctx.teamMeta.byId[resolved.resolvedId] : null;
    var nameEl;
    if (!resolved.pending && resolved.resolvedId) {
      nameEl = meta
        ? el("a", { "class": "cup-side-name team-link", href: profileHref(meta) }, esc(meta.name))
        : el("span", { "class": "cup-side-name" }, esc(resolved.display));
    } else {
      nameEl = el("span", { "class": "cup-side-name team-pending" }, esc(resolved.display));
    }
    var c = crest(meta, "?");
    if (side === "left") { wrap.appendChild(nameEl); wrap.appendChild(c); }
    else { wrap.appendChild(c); wrap.appendChild(nameEl); }
    return { el: wrap, resolved: resolved };
  }

  function matchCard(f, ctx) {
    var played = hasScore(f);
    var card = el("article", { "class": "cup-match" + (played ? " is-played" : "") });

    var tagParts = [];
    if (f.stage === "Group Stage") tagParts.push("Group " + (f.group || ""));
    else tagParts.push(f.stage);
    tagParts.push("Match " + (ctx.matchNo[f.id] || ""));
    var head = el("div", { "class": "cup-match-head" });
    head.appendChild(el("span", { "class": "cup-match-tag" }, esc(tagParts.join(" · "))));
    if (f.field) {
      head.appendChild(el("span", { "class": "cup-match-field" }, '<em>Field</em> ' + esc(f.field)));
    }
    card.appendChild(head);

    var body = el("div", { "class": "cup-match-body" });
    var s1 = matchSide(f.team1, ctx, "left");
    var s2 = matchSide(f.team2, ctx, "right");
    body.appendChild(s1.el);

    var center = el("div", { "class": "cup-center" });
    if (played) {
      center.appendChild(el("span", { "class": "cup-score" }, esc(f.score1) + " – " + esc(f.score2)));
      center.appendChild(el("span", { "class": "cup-time" }, "Full time"));
      var a = Number(f.score1), b = Number(f.score2);
      if (a > b) s1.el.classList.add("is-winner");
      else if (b > a) s2.el.classList.add("is-winner");
    } else {
      center.appendChild(el("span", { "class": "cup-kickoff" }, esc(f.time || "vs")));
    }
    body.appendChild(center);
    body.appendChild(s2.el);
    card.appendChild(body);
    if (org.on) card.appendChild(matchEditor(f, s1.resolved, s2.resolved, ctx));
    return card;
  }

  // ---- Organiser mode: PIN unlock, edit scores / goals / cards, save for everyone ----------
  var orgBar = null;

  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  function ensureBar() {
    if (!orgBar) {
      orgBar = el("div", { "class": "cup-org-bar" });
      orgBar.hidden = true;
      document.body.appendChild(orgBar);
    }
    return orgBar;
  }

  function updateBar(msg) {
    var bar = ensureBar();
    bar.hidden = !org.on;
    if (!org.on) return;
    bar.innerHTML = "";
    var txt = el("span", { "class": "cup-org-msg" }, msg || (org.dirty
      ? "<b>Unsaved changes.</b> Press Save for everyone."
      : "<b>Organiser mode.</b> Edit scores, goals and cards on the match cards."));
    var save = el("button", { type: "button", "class": "btn cup-org-save" }, "Save for everyone");
    save.disabled = !org.dirty;
    save.addEventListener("click", orgSave);
    var lk = el("button", { type: "button", "class": "cup-link-btn" }, "Lock");
    lk.addEventListener("click", orgLock);
    bar.appendChild(txt); bar.appendChild(save); bar.appendChild(lk);
  }

  function markDirty() { org.dirty = true; updateBar(); }

  function orgLock() {
    if (org.dirty && !window.confirm("Discard your unsaved changes?")) return;
    org.on = false; org.pin = ""; org.dirty = false; org.draft = {};
    try { sessionStorage.removeItem("gfc-org-pin"); } catch (e) {}
    updateBar();
    if (state.data) render(state.data);
  }

  function orgUnlock(p) {
    return fetch(SAVE_URL + "?check=1", { method: "POST", headers: { "x-organiser-pin": p } }).then(function (r) {
      if (r.ok) {
        org.on = true; org.pin = p;
        try { sessionStorage.setItem("gfc-org-pin", p); } catch (e) {}
        updateBar();
        if (state.data) render(state.data);
        return true;
      }
      return (r.status === 503 || r.status === 404) ? "setup" : false;
    }).catch(function () { return "net"; });
  }

  function orgSave() {
    updateBar("Saving…");
    fetch(SAVE_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-organiser-pin": org.pin },
      body: JSON.stringify({ fixtures: org.draft })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { r: r, j: j }; });
    }).then(function (x) {
      if (x.r.ok) {
        org.draft = {}; org.dirty = false;
        return load(false).then(function () { updateBar("<b>Saved.</b> Everyone now sees the update."); });
      }
      if (x.r.status === 401) { org.on = false; org.pin = ""; updateBar(); openPin("That PIN isn't right any more. Unlock again."); return; }
      updateBar("<b>Save didn't go through.</b> Check the PIN is set up in Netlify, then try again.");
    }).catch(function () {
      updateBar("<b>Save didn't go through.</b> Check your connection and try again.");
    });
  }

  function openPin(note) {
    var wrap = el("div", { "class": "cup-pin" });
    var box = el("form", { "class": "cup-pin-box" },
      '<h3>Organiser login</h3><p>Enter the organiser PIN to edit scores.</p>' +
      '<input type="password" class="cup-pin-in" autocomplete="current-password" aria-label="Organiser PIN">' +
      '<p class="cup-pin-msg"></p>' +
      '<div class="cup-pin-btns"><button type="submit" class="btn">Unlock</button> <button type="button" class="cup-link-btn cup-pin-cancel">Cancel</button></div>');
    wrap.appendChild(box);
    document.body.appendChild(wrap);
    var inp = box.querySelector(".cup-pin-in");
    var msg = box.querySelector(".cup-pin-msg");
    if (note) msg.textContent = note;
    function close() { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); }
    box.querySelector(".cup-pin-cancel").addEventListener("click", close);
    wrap.addEventListener("click", function (e) { if (e.target === wrap) close(); });
    box.addEventListener("submit", function (e) {
      e.preventDefault();
      var p = inp.value.trim();
      if (!p) return;
      msg.textContent = "Checking…";
      orgUnlock(p).then(function (res) {
        if (res === true) close();
        else if (res === "setup") msg.textContent = "Saving isn't set up yet. The organiser PIN hasn't been added in Netlify.";
        else if (res === "net") msg.textContent = "Couldn't reach the server. Check your connection.";
        else msg.textContent = "That PIN isn't right.";
      });
    });
    inp.focus();
  }

  function matchEditor(f, r1, r2, ctx) {
    var src = org.draft[f.id] || f;
    var d = {
      score1: num(src.score1), score2: num(src.score2),
      goals: (src.goals || []).map(function (g) { return { player: g.player || "", team: g.team || "", goals: Number(g.goals) || 1 }; }),
      cards: (src.cards || []).map(function (c) { return { player: c.player || "", team: c.team || "", type: c.type === "Red" ? "Red" : "Yellow" }; })
    };
    var sides = [
      { v: r1.resolvedId || f.team1, n: r1.display },
      { v: r2.resolvedId || f.team2, n: r2.display }
    ];
    var box = el("div", { "class": "cup-edit" });
    function commit() { org.draft[f.id] = d; markDirty(); }

    var dl = el("datalist", { id: "pl-" + f.id });
    sides.forEach(function (s) {
      var m = ctx.teamMeta.byId[s.v];
      ((m && m.team && m.team.players) || []).forEach(function (p) {
        if (p && p.name) dl.appendChild(el("option", { value: p.name }));
      });
    });
    box.appendChild(dl);

    var sr = el("div", { "class": "cup-edit-row" });
    sr.appendChild(el("span", { "class": "cup-edit-lab" }, "Score"));
    function scoreIn(key) {
      var i = el("input", { type: "number", min: "0", max: "99", "class": "cup-edit-num", "aria-label": "Score" });
      if (d[key] !== null) i.value = String(d[key]);
      i.addEventListener("input", function () {
        var v = i.value.trim();
        d[key] = v === "" ? null : Math.max(0, Math.min(99, parseInt(v, 10) || 0));
        commit();
      });
      return i;
    }
    sr.appendChild(scoreIn("score1"));
    sr.appendChild(el("span", {}, "–"));
    sr.appendChild(scoreIn("score2"));
    box.appendChild(sr);

    function sideSelect(cur, onChange) {
      var s = el("select", { "class": "cup-edit-sel", "aria-label": "Team" });
      var found = false;
      sides.forEach(function (x) {
        var o = el("option", { value: x.v }, esc(x.n));
        if (x.v === cur) { o.selected = true; found = true; }
        s.appendChild(o);
      });
      if (!found && cur) { var o2 = el("option", { value: cur }, esc(cur)); o2.selected = true; s.appendChild(o2); }
      s.addEventListener("change", function () { onChange(s.value); });
      return s;
    }
    function playerIn(item) {
      var i = el("input", { type: "text", list: "pl-" + f.id, placeholder: "Player name", maxlength: "80", "class": "cup-edit-txt", "aria-label": "Player" });
      i.value = item.player;
      i.addEventListener("input", function () { item.player = i.value; commit(); });
      return i;
    }
    function listEditor(title, key, blank, drawRow) {
      var sec = el("div", { "class": "cup-edit-sec" });
      var head = el("div", { "class": "cup-edit-row" });
      head.appendChild(el("span", { "class": "cup-edit-lab" }, title));
      var add = el("button", { type: "button", "class": "cup-link-btn" }, "+ Add");
      head.appendChild(add);
      sec.appendChild(head);
      var rows = el("div", { "class": "cup-edit-rows" });
      sec.appendChild(rows);
      function draw() {
        rows.innerHTML = "";
        d[key].forEach(function (item, idx) {
          var r = el("div", { "class": "cup-edit-item" });
          drawRow(r, item);
          var x = el("button", { type: "button", "class": "cup-edit-x", "aria-label": "Remove" }, "×");
          x.addEventListener("click", function () { d[key].splice(idx, 1); commit(); draw(); });
          r.appendChild(x);
          rows.appendChild(r);
        });
      }
      add.addEventListener("click", function () { d[key].push(blank()); commit(); draw(); });
      draw();
      return sec;
    }
    box.appendChild(listEditor("Goals", "goals", function () { return { player: "", team: sides[0].v, goals: 1 }; }, function (r, g) {
      r.appendChild(sideSelect(g.team, function (v) { g.team = v; commit(); }));
      r.appendChild(playerIn(g));
      var n = el("input", { type: "number", min: "1", max: "20", "class": "cup-edit-num", "aria-label": "Goals" });
      n.value = String(g.goals);
      n.addEventListener("input", function () { g.goals = Math.max(1, Math.min(20, parseInt(n.value, 10) || 1)); commit(); });
      r.appendChild(n);
    }));
    box.appendChild(listEditor("Cards", "cards", function () { return { player: "", team: sides[0].v, type: "Yellow" }; }, function (r, c) {
      r.appendChild(sideSelect(c.team, function (v) { c.team = v; commit(); }));
      r.appendChild(playerIn(c));
      var t = el("select", { "class": "cup-edit-sel", "aria-label": "Card" });
      ["Yellow", "Red"].forEach(function (k) {
        var o = el("option", { value: k }, k);
        if (c.type === k) o.selected = true;
        t.appendChild(o);
      });
      t.addEventListener("change", function () { c.type = t.value; commit(); });
      r.appendChild(t);
    }));
    return box;
  }

  function shrinkImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        URL.revokeObjectURL(url);
        if (!w || !h) { reject(new Error("bad")); return; }
        var s = Math.min(1, 256 / Math.max(w, h));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(w * s));
        c.height = Math.max(1, Math.round(h * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { if (b) resolve(b); else reject(new Error("bad")); }, "image/png");
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad")); };
      img.src = url;
    });
  }

  function logoDone(r, okMsg) {
    if (r.ok) return load(false).then(function () { updateBar(okMsg); });
    if (r.status === 401) { org.on = false; org.pin = ""; updateBar(); if (state.data) render(state.data); openPin("That PIN isn't right any more. Unlock again."); return; }
    throw new Error("fail");
  }

  function uploadLogo(id, file) {
    updateBar("Uploading logo…");
    shrinkImage(file).then(function (blob) {
      return fetch("/api/cup-logo?t=" + encodeURIComponent(id), {
        method: "POST", headers: { "x-organiser-pin": org.pin, "content-type": "image/png" }, body: blob
      });
    }).then(function (r) { return logoDone(r, "<b>Logo saved.</b> Everyone now sees it."); })
      .catch(function () { updateBar("<b>Logo didn't upload.</b> Try a PNG or JPG picture."); });
  }

  function removeLogo(id) {
    updateBar("Removing logo…");
    fetch("/api/cup-logo?t=" + encodeURIComponent(id), { method: "DELETE", headers: { "x-organiser-pin": org.pin } })
      .then(function (r) { return logoDone(r, "<b>Logo removed.</b>"); })
      .catch(function () { updateBar("<b>Couldn't remove the logo.</b> Try again."); });
  }

  function logoControls(t, meta) {
    var id = t.id || t.name;
    var box = el("span", { "class": "cup-logo-ctl" });
    var file = el("input", { type: "file", accept: "image/*" });
    file.hidden = true;
    var up = el("button", { type: "button", "class": "cup-link-btn" }, meta && meta.logo ? "Change logo" : "Upload logo");
    up.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () { if (file.files && file.files[0]) uploadLogo(id, file.files[0]); });
    box.appendChild(file);
    box.appendChild(up);
    if (meta && meta.logo) {
      var rm = el("button", { type: "button", "class": "cup-link-btn" }, "Remove");
      rm.addEventListener("click", function () { removeLogo(id); });
      box.appendChild(rm);
    }
    return box;
  }

  function applyOverlay(data, txt) {
    var ov = null;
    try { ov = JSON.parse(txt); } catch (e) {}
    if (!ov || !ov.fixtures) return "";
    (data.fixtures || []).forEach(function (f) {
      var o = ov.fixtures[f.id];
      if (!o) return;
      if ("score1" in o) f.score1 = o.score1;
      if ("score2" in o) f.score2 = o.score2;
      if (o.goals) f.goals = o.goals;
      if (o.cards) f.cards = o.cards;
    });
    if (ov.logos) {
      (data.groups || []).forEach(function (g) {
        (g.teams || []).forEach(function (t) {
          var id = t.id || t.name;
          if (id in ov.logos) t.logo = ov.logos[id] ? "/api/cup-logo?t=" + encodeURIComponent(id) + "&v=" + ov.logos[id] : "";
        });
      });
    }
    return ov.updated || "";
  }

  function emptyNote(text) {
    return el("p", { "class": "gfccup-empty" }, esc(text));
  }

  // ---- Hero & "Next up" -----------------------------------------------------------------
  function renderHero(data, ctx) {
    var title = document.getElementById("gfc-cup-title");
    if (title && data.tournamentName) title.textContent = data.tournamentName;
    if (data.tournamentName) document.title = data.tournamentName + " | Gurkha FC Brisbane Nepalese Football Club";

    var eyebrow = document.getElementById("cup-eyebrow");
    if (eyebrow) eyebrow.textContent = data.tournamentSubtitle || "Community football · Annual tournament";

    var when = document.getElementById("cup-when");
    if (when) {
      var firstDate = (data.fixtures || []).filter(function (f) { return f.date; })[0];
      var parts = [];
      var d = data.tournamentDate || (firstDate ? firstDate.date : "");
      if (d) parts.push(d);
      if (data.venue) parts.push(data.venue);
      when.textContent = parts.join(" · ");
      when.style.display = parts.length ? "" : "none";
    }

    var badge = document.getElementById("cup-badge");
    var badgeImg = document.getElementById("cup-badge-img");
    if (badge && badgeImg) {
      badgeImg.src = data.tournamentLogo || "images/gurkha-fc-logo.png";
      badgeImg.alt = (data.tournamentName || "GFC Cup") + " logo";
      badge.hidden = false;
    }

    renderNextUp(data, ctx);
  }

  function renderNextUp(data, ctx) {
    var wrap = document.getElementById("cup-nextup");
    var items = document.getElementById("cup-nextup-items");
    var tag = document.getElementById("cup-nextup-tag");
    if (!wrap || !items || !tag) return;
    items.innerHTML = "";

    var fixtures = ctx.fixtures;
    if (!fixtures.length) { wrap.hidden = true; return; }

    var unplayed = ctx.ordered.filter(function (o) { return !hasScore(o.f); });
    wrap.hidden = false;
    if (!unplayed.length) {
      tag.textContent = "Full time";
      items.appendChild(el("span", { "class": "cup-nextup-item" }, "All matches have been played"));
      return;
    }

    tag.textContent = "Next up";
    var first = unplayed[0];
    unplayed.filter(function (o) { return cmpKey([first.key[0], first.key[1]], [o.key[0], o.key[1]]) === 0; })
      .forEach(function (o) {
        var f = o.f;
        var a = resolveTeamRef(f.team1, ctx.groups, ctx.fixtures, ctx.teamMeta, 0).display;
        var b = resolveTeamRef(f.team2, ctx.groups, ctx.fixtures, ctx.teamMeta, 0).display;
        var bits = [a + " v " + b];
        if (f.field) bits.push(f.field);
        if (f.time) bits.push(f.time);
        items.appendChild(el("span", { "class": "cup-nextup-item" }, esc(bits.join(" · "))));
      });
  }

  // ---- Panels ---------------------------------------------------------------------------
  function renderFixturesPanel(ctx) {
    var panel = el("div", { "class": "tab-panel", id: "tab-fixtures", role: "tabpanel" });

    var groupFixtures = ctx.ordered.filter(function (o) { return o.f.stage === "Group Stage"; });
    if (!groupFixtures.length) {
      panel.appendChild(emptyNote("Fixtures haven't been scheduled yet."));
      return panel;
    }

    // Team filter
    var bar = el("div", { "class": "cup-filter" });
    bar.appendChild(el("label", { "for": "cup-team-filter" }, "Find your team"));
    var select = el("select", { id: "cup-team-filter" });
    select.appendChild(el("option", { value: "" }, "All teams"));
    ctx.teamMeta.list.forEach(function (m) {
      var o = el("option", { value: m.id }, esc(m.name + " (" + m.groupLabel + ")"));
      if (state.teamFilter === m.id) o.selected = true;
      select.appendChild(o);
    });
    bar.appendChild(select);
    panel.appendChild(bar);

    if (ctx.data.fixturesNote) {
      panel.appendChild(el("p", { "class": "cup-note" }, esc(ctx.data.fixturesNote)));
    }

    var results = el("div", { "class": "cup-slots" });
    panel.appendChild(results);

    function draw() {
      results.innerHTML = "";
      var filter = state.teamFilter;
      var list = groupFixtures.filter(function (o) {
        if (!filter) return true;
        var a = resolveTeamRef(o.f.team1, ctx.groups, ctx.fixtures, ctx.teamMeta, 0).resolvedId;
        var b = resolveTeamRef(o.f.team2, ctx.groups, ctx.fixtures, ctx.teamMeta, 0).resolvedId;
        return a === filter || b === filter;
      });
      if (!list.length) { results.appendChild(emptyNote("No matches found for that team.")); return; }

      var dates = [];
      list.forEach(function (o) { if (dates.indexOf(o.f.date || "") === -1) dates.push(o.f.date || ""); });
      var multiDate = dates.length > 1;

      var lastDate = null, lastSlot = null, grid = null;
      list.forEach(function (o) {
        var f = o.f;
        if (multiDate && (f.date || "") !== lastDate) {
          lastDate = f.date || "";
          results.appendChild(el("h3", { "class": "cup-date-head" }, esc(lastDate)));
          lastSlot = null;
        }
        var slotKey = (f.date || "") + "|" + (f.time || "");
        if (slotKey !== lastSlot) {
          lastSlot = slotKey;
          var start = parseMinutes(f.time);
          var label = f.time || "Time TBC";
          var mins = Number(ctx.data.matchMinutes);
          if (start !== null && mins > 0) label = fmtMinutes(start) + " – " + fmtMinutes(start + mins);
          results.appendChild(el("h4", { "class": "cup-slot-head" }, esc(label)));
          grid = el("div", { "class": "cup-grid" });
          results.appendChild(grid);
        }
        grid.appendChild(matchCard(f, ctx));
      });
    }

    select.addEventListener("change", function () {
      state.teamFilter = select.value;
      draw();
    });
    draw();
    return panel;
  }

  function renderGroupsPanel(ctx) {
    var panel = el("div", { "class": "tab-panel", id: "tab-groups", role: "tabpanel" });
    panel.hidden = true;
    if (!ctx.groups.length) { panel.appendChild(emptyNote("Groups haven't been announced yet.")); return panel; }

    var through = Number(ctx.data.qualifiersPerGroup) || 2;
    var legend = el("div", { "class": "cup-legend" });
    legend.appendChild(el("span", { "class": "cup-legend-item" }, '<i class="cup-dot"></i> Top ' + through + ' go through'));
    panel.appendChild(legend);

    var grid = el("div", { "class": "cup-grid cup-grid-groups" });
    ctx.groups.forEach(function (g) {
      var card = el("section", { "class": "cup-card" });
      var gf = ctx.fixtures.filter(function (f) { return f.stage === "Group Stage" && f.group === g.id; });
      var played = gf.filter(hasScore).length;

      var head = el("div", { "class": "cup-card-head" });
      head.appendChild(el("h3", {}, esc(g.label || ("Group " + g.id))));
      head.appendChild(el("span", { "class": "cup-pill" }, played + " of " + gf.length + " played"));
      card.appendChild(head);

      var rows = computeStandings(g, ctx.fixtures, ctx.teamMeta);
      if (!rows.length) {
        card.appendChild(emptyNote("Teams for this group haven't been announced yet."));
      } else {
        var wrap = el("div", { "class": "standings-wrap" });
        var table = el("table", { "class": "cup-table" });
        table.appendChild(el("thead", {}, "<tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>"));
        var tbody = el("tbody");
        rows.forEach(function (r, i) {
          var tr = el("tr", { "class": (played > 0 && i < through) ? "is-through" : "" });
          tr.appendChild(el("td", { "class": "pos" }, String(i + 1)));
          var td = el("td", { "class": "team" });
          td.appendChild(teamBadge(r.id, ctx.teamMeta));
          tr.appendChild(td);
          [r.p, r.w, r.d, r.l, r.gf, r.ga, r.gd].forEach(function (v) { tr.appendChild(el("td", {}, String(v))); });
          tr.appendChild(el("td", { "class": "pts" }, String(r.pts)));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        card.appendChild(wrap);
      }
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    return panel;
  }

  function renderKnockoutsPanel(ctx) {
    var panel = el("div", { "class": "tab-panel", id: "tab-knockouts", role: "tabpanel" });
    panel.hidden = true;

    var ko = ctx.ordered.filter(function (o) { return o.f.stage !== "Group Stage"; });
    ko.sort(function (a, b) {
      var oa = KNOCKOUT_ORDER.hasOwnProperty(a.f.stage) ? KNOCKOUT_ORDER[a.f.stage] : 99;
      var ob = KNOCKOUT_ORDER.hasOwnProperty(b.f.stage) ? KNOCKOUT_ORDER[b.f.stage] : 99;
      if (oa !== ob) return oa - ob;
      return cmpKey(a.key, b.key);
    });

    if (!ko.length) {
      panel.appendChild(emptyNote("Knockout fixtures will appear here once the group stage is decided."));
      return panel;
    }

    panel.appendChild(el("p", { "class": "cup-note" }, "Teams fill in automatically once every group game is played."));

    var rounds = [];
    ko.forEach(function (o) { if (rounds.indexOf(o.f.stage) === -1) rounds.push(o.f.stage); });
    rounds.forEach(function (round) {
      var items = ko.filter(function (o) { return o.f.stage === round; });
      var sample = items[0].f;
      var sub = [];
      if (sample.time) sub.push(sample.time);
      panel.appendChild(el("h3", { "class": "cup-round-head" }, esc(round) + (sub.length ? ' <span>' + esc(sub.join(" · ")) + '</span>' : "")));
      var grid = el("div", { "class": "cup-grid" });
      items.forEach(function (o) {
        grid.appendChild(matchCard(o.f, ctx));
      });
      panel.appendChild(grid);
    });
    return panel;
  }

  function statTable(headHtml, rows, rowFn) {
    var wrap = el("div", { "class": "standings-wrap" });
    var table = el("table", { "class": "cup-table cup-table-stat" });
    table.appendChild(el("thead", {}, headHtml));
    var tbody = el("tbody");
    rows.forEach(function (r, i) { tbody.appendChild(rowFn(r, i)); });
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }

  function renderStatsPanel(ctx) {
    var panel = el("div", { "class": "tab-panel", id: "tab-stats", role: "tabpanel" });
    panel.hidden = true;
    var grid = el("div", { "class": "cup-grid cup-grid-stats" });

    var scorers = computeTopScorers(ctx.fixtures, ctx.teamMeta);
    var c1 = el("section", { "class": "cup-card" });
    c1.appendChild(el("div", { "class": "cup-card-head" }, "<h3>Top scorers</h3>"));
    if (!scorers.length) c1.appendChild(emptyNote("No goals have been recorded yet."));
    else c1.appendChild(statTable("<tr><th>#</th><th>Player</th><th>Team</th><th>Goals</th></tr>", scorers, function (r, i) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "pos" }, String(i + 1)));
      tr.appendChild(el("td", { "class": "team" }, esc(r.player)));
      var td = el("td"); td.appendChild(teamBadge(r.team, ctx.teamMeta)); tr.appendChild(td);
      tr.appendChild(el("td", { "class": "pts" }, String(r.goals)));
      return tr;
    }));
    grid.appendChild(c1);

    var cards = computeCards(ctx.fixtures, ctx.teamMeta);
    var c2 = el("section", { "class": "cup-card" });
    c2.appendChild(el("div", { "class": "cup-card-head" }, "<h3>Cards</h3>"));
    if (!cards.length) c2.appendChild(emptyNote("No cards have been recorded yet."));
    else c2.appendChild(statTable("<tr><th>Player</th><th>Team</th><th>Yellow</th><th>Red</th></tr>", cards, function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "team" }, esc(r.player)));
      var td = el("td"); td.appendChild(teamBadge(r.team, ctx.teamMeta)); tr.appendChild(td);
      tr.appendChild(el("td", {}, String(r.yellow)));
      tr.appendChild(el("td", { "class": "pts" }, String(r.red)));
      return tr;
    }));
    grid.appendChild(c2);

    panel.appendChild(grid);
    return panel;
  }

  function renderTeamsPanel(ctx) {
    var panel = el("div", { "class": "tab-panel", id: "tab-teams", role: "tabpanel" });
    panel.hidden = true;
    if (!ctx.groups.length) { panel.appendChild(emptyNote("Teams haven't been announced yet.")); return panel; }
    panel.appendChild(el("p", { "class": "cup-note" }, "Tap a team to see its squad, manager and coach."));
    var grid = el("div", { "class": "cup-grid cup-grid-teams" });
    ctx.groups.forEach(function (g) {
      var card = el("section", { "class": "cup-card" });
      card.appendChild(el("div", { "class": "cup-card-head" }, "<h3>" + esc(g.label || ("Group " + g.id)) + "</h3>"));
      var list = el("ol", { "class": "cup-team-list" });
      (g.teams || []).forEach(function (t, i) {
        var meta = ctx.teamMeta.byId[t.id || t.name];
        var li = el("li");
        li.appendChild(el("span", { "class": "cup-team-pos" }, String(i + 1)));
        li.appendChild(teamBadge(t.id || t.name, ctx.teamMeta));
        if (org.on) li.appendChild(logoControls(t, meta));
        list.appendChild(li);
      });
      card.appendChild(list);
      grid.appendChild(card);
    });
    panel.appendChild(grid);
    return panel;
  }

  function renderRulesPanel(ctx) {
    var rules = (ctx.data.rules || []).filter(function (r) { return r && (r.title || r.text); });
    if (!rules.length) return null;
    var panel = el("div", { "class": "tab-panel", id: "tab-rules", role: "tabpanel" });
    panel.hidden = true;

    var top = el("div", { "class": "cup-rules-top" });
    top.appendChild(el("h3", {}, "Official rules & regulations"));
    var btns = el("div", { "class": "cup-rules-btns" });
    var exp = el("button", { type: "button", "class": "cup-link-btn" }, "Expand all");
    var col = el("button", { type: "button", "class": "cup-link-btn" }, "Collapse all");
    btns.appendChild(exp); btns.appendChild(col);
    top.appendChild(btns);
    panel.appendChild(top);

    if (ctx.data.rulesIntro) panel.appendChild(el("p", { "class": "cup-note" }, esc(ctx.data.rulesIntro)));

    var list = el("div", { "class": "cup-rules" });
    rules.forEach(function (r, i) {
      var d = el("details", { "class": "cup-rule" });
      var s = el("summary", {}, '<span class="cup-rule-num">' + (i + 1) + '</span><span>' + esc(r.title || "") + '</span>');
      d.appendChild(s);
      var body = el("div", { "class": "cup-rule-body" });
      String(r.text || "").split(/\n+/).forEach(function (line) {
        if (line.trim()) body.appendChild(el("p", {}, esc(line.trim())));
      });
      d.appendChild(body);
      list.appendChild(d);
    });
    panel.appendChild(list);

    function setAll(open) {
      list.querySelectorAll("details").forEach(function (d) { d.open = open; });
    }
    exp.addEventListener("click", function () { setAll(true); });
    col.addEventListener("click", function () { setAll(false); });
    return panel;
  }

  // ---- Page assembly ----------------------------------------------------------------------
  function buildContext(data) {
    var groups = data.groups || [];
    var fixtures = data.fixtures || [];
    var teamMeta = buildTeamMeta(groups);
    var ordered = fixtures.map(function (f, i) { return { f: f, key: sortKey(f, i) }; });
    ordered.sort(function (a, b) { return cmpKey(a.key, b.key); });
    var matchNo = {};
    ordered.forEach(function (o, i) { if (o.f.id) matchNo[o.f.id] = i + 1; });
    return { data: data, groups: groups, fixtures: fixtures, teamMeta: teamMeta, ordered: ordered, matchNo: matchNo };
  }

  function activate(tabId) {
    var btns = document.querySelectorAll("#gfccup-tabs .tab-btn");
    var found = false;
    btns.forEach(function (b) { if (b.getAttribute("data-tab") === tabId) found = true; });
    if (!found) tabId = "teams";
    state.activeTab = tabId;
    btns.forEach(function (b) {
      var on = b.getAttribute("data-tab") === tabId;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.querySelectorAll("#gfccup-panels .tab-panel").forEach(function (p) {
      p.hidden = p.id !== "tab-" + tabId;
    });
  }

  function render(data) {
    var tabsWrap = document.getElementById("gfccup-tabs");
    var panelsWrap = document.getElementById("gfccup-panels");
    if (!tabsWrap || !panelsWrap) return;
    tabsWrap.innerHTML = "";
    panelsWrap.innerHTML = "";

    var ctx = buildContext(data);
    renderHero(data, ctx);

    var tabs = [
      { id: "teams", label: "Teams", panel: renderTeamsPanel(ctx) },
      { id: "groups", label: "Group Tables", panel: renderGroupsPanel(ctx) },
      { id: "fixtures", label: "Group Fixtures", panel: renderFixturesPanel(ctx) },
      { id: "knockouts", label: "Knockouts", panel: renderKnockoutsPanel(ctx) },
      { id: "stats", label: "Top Scorers", panel: renderStatsPanel(ctx) }
    ];
    var rules = renderRulesPanel(ctx);
    if (rules) tabs.push({ id: "rules", label: "Rules", panel: rules });

    tabs.forEach(function (t) {
      var btn = el("button", {
        type: "button", "class": "tab-btn", "data-tab": t.id, role: "tab",
        "aria-selected": "false", id: "tab-btn-" + t.id, "aria-controls": "tab-" + t.id
      }, t.label);
      btn.addEventListener("click", function () {
        activate(t.id);
        try { history.replaceState(null, "", "#" + t.id); } catch (e) {}
      });
      tabsWrap.appendChild(btn);
      panelsWrap.appendChild(t.panel);
    });

    var footer = el("p", { "class": "cup-updated" });
    if (state.lastModified) {
      var d = new Date(state.lastModified);
      if (!isNaN(d)) {
        footer.textContent = "Last updated " + d.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
        panelsWrap.appendChild(footer);
      }
    }

    if (!org.on) {
      var ol = el("p", { "class": "cup-org-link" });
      var ob = el("button", { type: "button", "class": "cup-link-btn" }, "Organiser login");
      ob.addEventListener("click", function () { openPin(); });
      ol.appendChild(ob);
      panelsWrap.appendChild(ol);
    }
    updateBar();

    var hash = (window.location.hash || "").replace("#", "");
    activate(hash || state.activeTab);
  }

  function load(isRefresh) {
    var ovp = fetch(SAVE_URL + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      return r.ok ? r.text() : "";
    }).catch(function () { return ""; });
    return fetch(DATA_URL + (isRefresh ? "?t=" + Date.now() : ""), { cache: "no-cache" }).then(function (r) {
      var lm = r.headers.get("Last-Modified") || "";
      return r.text().then(function (txt) { return { txt: txt, lm: lm }; });
    }).then(function (res) {
      return ovp.then(function (otxt) {
        var raw = res.txt + "\n" + otxt;
        if (isRefresh && (raw === state.raw || org.on)) return;
        state.raw = raw;
        state.lastModified = res.lm;
        var data = JSON.parse(res.txt);
        var upd = applyOverlay(data, otxt);
        if (upd) {
          var a = new Date(upd), b = new Date(res.lm || 0);
          if (!isNaN(a) && (isNaN(b) || a > b)) state.lastModified = upd;
        }
        state.data = data;
        render(data);
      });
    });
  }

  load(false).then(function () {
    try { var sp = sessionStorage.getItem("gfc-org-pin"); if (sp) orgUnlock(sp); } catch (e) {}
  }).catch(function (err) {
    console.error("Could not load GFC Cup data", err);
  });

  // Keep an open page fresh: pick up new scores without a manual reload.
  setInterval(function () {
    if (document.hidden) return;
    load(true).catch(function () {});
  }, REFRESH_MS);
})();
