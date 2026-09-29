/* Renders the GFC Cup page (group tables + fixtures + stats) from data/gfccup.json */
(function () {
  var KNOCKOUT_ORDER = { "Quarter Final": 0, "Semi Final": 1, "Final": 2 };

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function hasScore(f) {
    return f.score1 !== null && f.score1 !== undefined && f.score1 !== "" &&
           f.score2 !== null && f.score2 !== undefined && f.score2 !== "";
  }

  function fmtDate(f) {
    var parts = [];
    if (f.date) parts.push(f.date);
    if (f.time) parts.push(f.time);
    return parts.join(" · ");
  }

  // Builds a lookup so fixtures/goals/cards (which reference a team by its fixed Slot,
  // e.g. "A1") always show the CURRENT club name, logo and profile link — even after the
  // admin renames the club. Falls back to matching by the current name too, so a Goals/
  // Cards "team" entry typed as the club name (instead of its Slot) still resolves.
  function buildTeamMeta(groups) {
    var byId = {};
    var byName = {};
    (groups || []).forEach(function (g) {
      (g.teams || []).forEach(function (t) {
        if (!t) return;
        var id = t.id || t.name;
        if (!id) return;
        var meta = { id: id, name: t.name || id, logo: t.logo || "", group: g.id };
        byId[id] = meta;
        if (t.name) byName[t.name.trim().toLowerCase()] = meta;
      });
    });
    return { byId: byId, byName: byName };
  }

  // Resolves a value that may be a team's Slot ID or its current display name to that
  // team's canonical meta ({id, name, logo, group}), or null if it matches nothing on file.
  function lookupTeam(ref, teamMeta) {
    if (!ref) return null;
    ref = String(ref).trim();
    if (teamMeta.byId[ref]) return teamMeta.byId[ref];
    var byName = teamMeta.byName[ref.toLowerCase()];
    return byName || null;
  }

  function computeStandings(group, fixtures, teamMeta) {
    var stats = {};

    (group.teams || []).forEach(function (t) {
      var id = t && (t.id || t.name);
      if (!id) return;
      stats[id] = { id: id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
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
      if (!stats[id1]) stats[id1] = { id: id1, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      if (!stats[id2]) stats[id2] = { id: id2, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
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
      return a.displayName.localeCompare(b.displayName);
    });

    return rows;
  }

  // Resolves a team slot that may be a literal team Slot ID / name, or a qualifier phrase
  // like "Winner Group A", "Runner-up Group B", or "Winner qf1" (referencing another
  // fixture's winner by its Match ID). Returns { display, resolvedId, pending }.
  // resolvedId is the canonical, stable team Slot ID once known (never the display name),
  // so the caller always looks up the CURRENT name/logo/link for it; pending is true while
  // the slot can't be worked out yet (earlier matches not finished).
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
      var winnerRef = s1 > s2 ? f.team1 : f.team2;
      return resolveTeamRef(winnerRef, groups, fixtures, teamMeta, depth + 1);
    }

    // A literal team reference — could be a Slot ID or the current club name.
    var found = lookupTeam(ref, teamMeta);
    var id = found ? found.id : ref;
    return { display: found ? found.name : ref, resolvedId: id, pending: false };
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

  // ref here is always a canonical team Slot ID (or, as a fallback, a raw string that
  // didn't match any team on file) — never assume it's the display name.
  function teamBadge(ref, teamMeta) {
    var meta = teamMeta.byId[ref] || lookupTeam(ref, teamMeta);
    var label = meta ? meta.name : ref;
    var span = el("span", { "class": "team-name-badge" });
    if (meta && meta.logo) {
      span.appendChild(el("img", { "class": "team-logo", src: meta.logo, alt: label }));
    }
    if (meta) {
      var link = el("a", {
        "class": "team-link",
        href: "club-profile.html?team=" + encodeURIComponent(meta.id) + "&group=" + encodeURIComponent(meta.group)
      }, label);
      span.appendChild(link);
    } else {
      span.appendChild(el("span", {}, label));
    }
    return span;
  }

  // Renders a fixture's team slot: a resolved literal team (badge/link, always showing the
  // CURRENT club name) or a still-pending qualifier phrase like "Winner Group A (TBD)"
  // shown as plain, muted text.
  function teamSlot(ref, groups, fixtures, teamMeta) {
    var resolved = resolveTeamRef(ref, groups, fixtures, teamMeta, 0);
    if (!resolved.pending && resolved.resolvedId) {
      return teamBadge(resolved.resolvedId, teamMeta);
    }
    return el("span", { "class": "team-name-badge team-pending" }, resolved.display);
  }

  function renderStandingsTable(rows, teamMeta) {
    if (!rows.length) {
      return el("p", { "class": "gfccup-empty" }, "Teams for this group haven't been announced yet.");
    }
    var table = el("table", { "class": "standings-table" });
    var thead = el("thead", {}, "<tr><th>#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr>");
    table.appendChild(thead);
    var tbody = el("tbody");
    rows.forEach(function (r, i) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "pos" }, String(i + 1)));
      var teamTd = el("td", { "class": "team" });
      teamTd.appendChild(teamBadge(r.id, teamMeta));
      tr.appendChild(teamTd);
      tr.appendChild(el("td", {}, String(r.p)));
      tr.appendChild(el("td", {}, String(r.w)));
      tr.appendChild(el("td", {}, String(r.d)));
      tr.appendChild(el("td", {}, String(r.l)));
      tr.appendChild(el("td", {}, String(r.gf)));
      tr.appendChild(el("td", {}, String(r.ga)));
      tr.appendChild(el("td", {}, String(r.gd)));
      tr.appendChild(el("td", { "class": "pts" }, String(r.pts)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var wrap = el("div", { "class": "standings-wrap" });
    wrap.appendChild(table);
    return wrap;
  }

  function renderFixtureRow(f, teamMeta, groups, fixtures) {
    var row = el("div", { "class": "fixture-row" });
    row.appendChild(el("div", { "class": "fixture-meta" }, fmtDate(f) || "&nbsp;"));
    var match = el("div", { "class": "fixture-match" });
    var team1El = el("span", { "class": "fixture-team" });
    team1El.appendChild(teamSlot(f.team1, groups, fixtures, teamMeta));
    match.appendChild(team1El);
    if (hasScore(f)) {
      match.appendChild(el("span", { "class": "fixture-score" }, f.score1 + " – " + f.score2));
    } else {
      match.appendChild(el("span", { "class": "fixture-vs" }, "vs"));
    }
    var team2El = el("span", { "class": "fixture-team" });
    team2El.appendChild(teamSlot(f.team2, groups, fixtures, teamMeta));
    match.appendChild(team2El);
    row.appendChild(match);
    if (f.field) row.appendChild(el("div", { "class": "fixture-field" }, f.field));
    return row;
  }

  function renderFixturesList(fixtureList, teamMeta, groups, allFixtures) {
    if (!fixtureList.length) {
      return el("p", { "class": "gfccup-empty" }, "Fixtures haven't been scheduled yet.");
    }
    var list = el("div", { "class": "fixtures-list" });
    fixtureList.forEach(function (f) { list.appendChild(renderFixtureRow(f, teamMeta, groups, allFixtures)); });
    return list;
  }

  function renderTopScorers(rows, teamMeta) {
    if (!rows.length) {
      return el("p", { "class": "gfccup-empty" }, "No goals have been recorded yet.");
    }
    var table = el("table", { "class": "standings-table" });
    table.appendChild(el("thead", {}, "<tr><th>#</th><th>Player</th><th>Team</th><th>Goals</th></tr>"));
    var tbody = el("tbody");
    rows.forEach(function (r, i) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "pos" }, String(i + 1)));
      tr.appendChild(el("td", { "class": "team" }, r.player));
      var teamTd = el("td", {});
      teamTd.appendChild(teamBadge(r.team, teamMeta));
      tr.appendChild(teamTd);
      tr.appendChild(el("td", { "class": "pts" }, String(r.goals)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var wrap = el("div", { "class": "standings-wrap" });
    wrap.appendChild(table);
    return wrap;
  }

  function renderCardsTable(rows, teamMeta) {
    if (!rows.length) {
      return el("p", { "class": "gfccup-empty" }, "No cards have been recorded yet.");
    }
    var table = el("table", { "class": "standings-table" });
    table.appendChild(el("thead", {}, "<tr><th>Player</th><th>Team</th><th>Yellow</th><th>Red</th></tr>"));
    var tbody = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "team" }, r.player));
      var teamTd = el("td", {});
      teamTd.appendChild(teamBadge(r.team, teamMeta));
      tr.appendChild(teamTd);
      tr.appendChild(el("td", {}, String(r.yellow)));
      tr.appendChild(el("td", { "class": "pts" }, String(r.red)));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var wrap = el("div", { "class": "standings-wrap" });
    wrap.appendChild(table);
    return wrap;
  }

  function render(data) {
    var tabsWrap = document.getElementById("gfccup-tabs");
    var panelsWrap = document.getElementById("gfccup-panels");
    if (!tabsWrap || !panelsWrap) return;

    var titleEl = document.getElementById("gfc-cup-title");
    if (titleEl && data.tournamentName) titleEl.textContent = data.tournamentName;
    if (data.tournamentName) document.title = data.tournamentName + " | Gurkha FC Brisbane Nepalese Football Club";

    var groups = data.groups || [];
    var fixtures = data.fixtures || [];
    var teamMeta = buildTeamMeta(groups);

    groups.forEach(function (g, i) {
      var isFirst = i === 0;
      var btn = el("button", {
        type: "button",
        "class": "tab-btn" + (isFirst ? " active" : ""),
        "data-tab": "group-" + g.id,
        role: "tab",
        "aria-selected": isFirst ? "true" : "false",
        id: "tab-btn-group-" + g.id,
        "aria-controls": "tab-group-" + g.id
      }, g.label || ("Group " + g.id));
      tabsWrap.appendChild(btn);

      var panel = el("div", {
        "class": "tab-panel",
        id: "tab-group-" + g.id,
        role: "tabpanel",
        "aria-labelledby": "tab-btn-group-" + g.id
      });
      if (!isFirst) panel.setAttribute("hidden", "");

      var standingsRows = computeStandings(g, fixtures, teamMeta);
      panel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Group Table"));
      panel.appendChild(renderStandingsTable(standingsRows, teamMeta));

      var groupFixtures = fixtures.filter(function (f) { return f.stage === "Group Stage" && f.group === g.id; });
      panel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Fixtures & Results"));
      panel.appendChild(renderFixturesList(groupFixtures, teamMeta, groups, fixtures));

      panelsWrap.appendChild(panel);
    });

    // Knockouts tab
    var koBtn = el("button", {
      type: "button", "class": "tab-btn", "data-tab": "knockouts", role: "tab",
      "aria-selected": "false", id: "tab-btn-knockouts", "aria-controls": "tab-knockouts"
    }, "Knockouts");
    tabsWrap.appendChild(koBtn);

    var koPanel = el("div", {
      "class": "tab-panel", id: "tab-knockouts", role: "tabpanel", "aria-labelledby": "tab-btn-knockouts"
    });
    koPanel.setAttribute("hidden", "");

    var koFixtures = fixtures.filter(function (f) { return f.stage !== "Group Stage"; });
    koFixtures.sort(function (a, b) {
      var oa = KNOCKOUT_ORDER.hasOwnProperty(a.stage) ? KNOCKOUT_ORDER[a.stage] : 99;
      var ob = KNOCKOUT_ORDER.hasOwnProperty(b.stage) ? KNOCKOUT_ORDER[b.stage] : 99;
      return oa - ob;
    });

    if (!koFixtures.length) {
      koPanel.appendChild(el("p", { "class": "gfccup-empty" }, "Knockout fixtures will appear here once the group stage is decided."));
    } else {
      var rounds = [];
      koFixtures.forEach(function (f) {
        if (rounds.indexOf(f.stage) === -1) rounds.push(f.stage);
      });
      rounds.forEach(function (roundName) {
        koPanel.appendChild(el("h3", { "class": "gfccup-subhead" }, roundName));
        var roundFixtures = koFixtures.filter(function (f) { return f.stage === roundName; });
        koPanel.appendChild(renderFixturesList(roundFixtures, teamMeta, groups, fixtures));
      });
    }

    panelsWrap.appendChild(koPanel);

    // Stats tab — Top Scorers + Cards, aggregated across every fixture in the tournament
    var statsBtn = el("button", {
      type: "button", "class": "tab-btn", "data-tab": "stats", role: "tab",
      "aria-selected": "false", id: "tab-btn-stats", "aria-controls": "tab-stats"
    }, "Stats");
    tabsWrap.appendChild(statsBtn);

    var statsPanel = el("div", {
      "class": "tab-panel", id: "tab-stats", role: "tabpanel", "aria-labelledby": "tab-btn-stats"
    });
    statsPanel.setAttribute("hidden", "");

    var scorers = computeTopScorers(fixtures, teamMeta);
    statsPanel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Top Scorers"));
    statsPanel.appendChild(renderTopScorers(scorers, teamMeta));

    var cards = computeCards(fixtures, teamMeta);
    statsPanel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Cards"));
    statsPanel.appendChild(renderCardsTable(cards, teamMeta));

    panelsWrap.appendChild(statsPanel);

    if (groups.length === 0) {
      tabsWrap.style.display = "none";
    }

    if (window.GFC_initTabs) window.GFC_initTabs();
  }

  fetch("data/gfccup.json").then(function (r) { return r.json(); }).then(render).catch(function (err) {
    console.error("Could not load GFC Cup data", err);
  });
})();
