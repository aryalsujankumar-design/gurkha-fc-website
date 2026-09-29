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

  // Builds a lookup of team name -> {logo, group} from every group, so fixtures
  // (which just reference teams by name) can also show the right badge/link.
  function buildTeamMeta(groups) {
    var map = {};
    (groups || []).forEach(function (g) {
      (g.teams || []).forEach(function (t) {
        if (t && t.name) map[t.name] = { logo: t.logo || "", group: g.id };
      });
    });
    return map;
  }

  function teamBadge(name, teamMeta) {
    var meta = teamMeta[name];
    var span = el("span", { "class": "team-name-badge" });
    if (meta && meta.logo) {
      span.appendChild(el("img", { "class": "team-logo", src: meta.logo, alt: name }));
    }
    if (meta) {
      var link = el("a", {
        "class": "team-link",
        href: "club-profile.html?team=" + encodeURIComponent(name) + "&group=" + encodeURIComponent(meta.group)
      }, name);
      span.appendChild(link);
    } else {
      span.appendChild(el("span", {}, name));
    }
    return span;
  }

  function computeStandings(group, fixtures) {
    var stats = {};
    (group.teams || []).forEach(function (t) {
      var name = t && t.name ? t.name : t;
      if (!name) return;
      stats[name] = { team: name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
    });

    fixtures.forEach(function (f) {
      if (f.stage !== "Group Stage" || f.group !== group.id) return;
      if (!hasScore(f)) return;
      var s1 = Number(f.score1), s2 = Number(f.score2);
      if (!stats[f.team1]) stats[f.team1] = { team: f.team1, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      if (!stats[f.team2]) stats[f.team2] = { team: f.team2, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      var a = stats[f.team1], b = stats[f.team2];
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
      return r;
    });

    rows.sort(function (a, b) {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.team.localeCompare(b.team);
    });

    return rows;
  }

  function computeTopScorers(fixtures) {
    var stats = {};
    fixtures.forEach(function (f) {
      (f.goals || []).forEach(function (g) {
        if (!g.player) return;
        var key = g.player + "||" + (g.team || "");
        if (!stats[key]) stats[key] = { player: g.player, team: g.team || "", goals: 0 };
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

  function computeCards(fixtures) {
    var stats = {};
    fixtures.forEach(function (f) {
      (f.cards || []).forEach(function (c) {
        if (!c.player) return;
        var key = c.player + "||" + (c.team || "");
        if (!stats[key]) stats[key] = { player: c.player, team: c.team || "", yellow: 0, red: 0 };
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
      teamTd.appendChild(teamBadge(r.team, teamMeta));
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

  function renderFixtureRow(f, teamMeta) {
    var row = el("div", { "class": "fixture-row" });
    row.appendChild(el("div", { "class": "fixture-meta" }, fmtDate(f) || "&nbsp;"));
    var match = el("div", { "class": "fixture-match" });
    var team1El = el("span", { "class": "fixture-team" });
    team1El.appendChild(teamBadge(f.team1, teamMeta));
    match.appendChild(team1El);
    if (hasScore(f)) {
      match.appendChild(el("span", { "class": "fixture-score" }, f.score1 + " – " + f.score2));
    } else {
      match.appendChild(el("span", { "class": "fixture-vs" }, "vs"));
    }
    var team2El = el("span", { "class": "fixture-team" });
    team2El.appendChild(teamBadge(f.team2, teamMeta));
    match.appendChild(team2El);
    row.appendChild(match);
    if (f.field) row.appendChild(el("div", { "class": "fixture-field" }, f.field));
    return row;
  }

  function renderFixturesList(fixtures, teamMeta) {
    if (!fixtures.length) {
      return el("p", { "class": "gfccup-empty" }, "Fixtures haven't been scheduled yet.");
    }
    var list = el("div", { "class": "fixtures-list" });
    fixtures.forEach(function (f) { list.appendChild(renderFixtureRow(f, teamMeta)); });
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

      var standingsRows = computeStandings(g, fixtures);
      panel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Group Table"));
      panel.appendChild(renderStandingsTable(standingsRows, teamMeta));

      var groupFixtures = fixtures.filter(function (f) { return f.stage === "Group Stage" && f.group === g.id; });
      panel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Fixtures & Results"));
      panel.appendChild(renderFixturesList(groupFixtures, teamMeta));

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
        koPanel.appendChild(renderFixturesList(roundFixtures, teamMeta));
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

    var scorers = computeTopScorers(fixtures);
    statsPanel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Top Scorers"));
    statsPanel.appendChild(renderTopScorers(scorers, teamMeta));

    var cards = computeCards(fixtures);
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
