/* Renders the GFC Cup page (group tables + fixtures) from data/gfccup.json */
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

  function computeStandings(group, fixtures) {
    var stats = {};
    (group.teams || []).forEach(function (t) {
      stats[t] = { team: t, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
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

  function renderStandingsTable(rows) {
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
      tr.appendChild(el("td", { "class": "team" }, r.team));
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

  function renderFixtureRow(f) {
    var row = el("div", { "class": "fixture-row" });
    row.appendChild(el("div", { "class": "fixture-meta" }, fmtDate(f) || "&nbsp;"));
    var match = el("div", { "class": "fixture-match" });
    match.appendChild(el("span", { "class": "fixture-team" }, f.team1));
    if (hasScore(f)) {
      match.appendChild(el("span", { "class": "fixture-score" }, f.score1 + " – " + f.score2));
    } else {
      match.appendChild(el("span", { "class": "fixture-vs" }, "vs"));
    }
    match.appendChild(el("span", { "class": "fixture-team" }, f.team2));
    row.appendChild(match);
    if (f.field) row.appendChild(el("div", { "class": "fixture-field" }, f.field));
    return row;
  }

  function renderFixturesList(fixtures) {
    if (!fixtures.length) {
      return el("p", { "class": "gfccup-empty" }, "Fixtures haven't been scheduled yet.");
    }
    var list = el("div", { "class": "fixtures-list" });
    fixtures.forEach(function (f) { list.appendChild(renderFixtureRow(f)); });
    return list;
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
      panel.appendChild(renderStandingsTable(standingsRows));

      var groupFixtures = fixtures.filter(function (f) { return f.stage === "Group Stage" && f.group === g.id; });
      panel.appendChild(el("h3", { "class": "gfccup-subhead" }, "Fixtures & Results"));
      panel.appendChild(renderFixturesList(groupFixtures));

      panelsWrap.appendChild(panel);
    });

    // Knockouts tab, appended last
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
        koPanel.appendChild(renderFixturesList(roundFixtures));
      });
    }

    panelsWrap.appendChild(koPanel);

    if (groups.length === 0) {
      tabsWrap.style.display = "none";
    }

    if (window.GFC_initTabs) window.GFC_initTabs();
  }

  fetch("data/gfccup.json").then(function (r) { return r.json(); }).then(render).catch(function (err) {
    console.error("Could not load GFC Cup data", err);
  });
})();
