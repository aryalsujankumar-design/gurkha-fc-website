/* Renders a single club's squad + staff (club-profile.html?team=<name>&group=<id>) from data/gfccup.json */
(function () {
  var POSITION_ORDER = { "Keeper": 0, "Defender": 1, "Midfielder": 2, "Forward": 3 };

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function findTeam(data, name, groupId) {
    var groups = data.groups || [];
    // Prefer the named group, if given, in case of a name clash across groups.
    if (groupId) {
      var g = groups.filter(function (g) { return g.id === groupId; })[0];
      if (g) {
        var t = (g.teams || []).filter(function (t) { return t.name === name; })[0];
        if (t) return t;
      }
    }
    for (var i = 0; i < groups.length; i++) {
      var match = (groups[i].teams || []).filter(function (t) { return t.name === name; })[0];
      if (match) return match;
    }
    return null;
  }

  function renderSquad(players) {
    var wrap = document.getElementById("club-squad");
    if (!players || !players.length) {
      wrap.appendChild(el("p", { "class": "gfccup-empty" }, "The squad list for this club hasn't been added yet."));
      return;
    }

    var sorted = players.slice().sort(function (a, b) {
      var oa = POSITION_ORDER.hasOwnProperty(a.position) ? POSITION_ORDER[a.position] : 99;
      var ob = POSITION_ORDER.hasOwnProperty(b.position) ? POSITION_ORDER[b.position] : 99;
      if (oa !== ob) return oa - ob;
      var na = Number(a.number), nb = Number(b.number);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return 0;
    });

    var table = el("table", { "class": "standings-table squad-table" });
    table.appendChild(el("thead", {}, "<tr><th>#</th><th>Player</th><th>Position</th></tr>"));
    var tbody = el("tbody");
    sorted.forEach(function (p) {
      var tr = el("tr");
      tr.appendChild(el("td", { "class": "pos" }, p.number ? String(p.number) : "—"));
      tr.appendChild(el("td", { "class": "team" }, p.name || ""));
      tr.appendChild(el("td", {}, p.position || "—"));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    var w = el("div", { "class": "standings-wrap" });
    w.appendChild(table);
    wrap.appendChild(w);
  }

  function render(data) {
    var params = new URLSearchParams(window.location.search);
    var teamName = params.get("team");
    var groupId = params.get("group");

    var team = teamName ? findTeam(data, teamName, groupId) : null;

    if (!team) {
      document.getElementById("club-title").textContent = "Club not found";
      document.getElementById("club-crumb").textContent = "Club";
      document.getElementById("club-squad").appendChild(
        el("p", { "class": "gfccup-empty" }, "We couldn't find that club. Head back to the GFC Cup page and click a team name.")
      );
      return;
    }

    document.title = team.name + " | GFC Cup | Gurkha FC Brisbane Nepalese Football Club";
    document.getElementById("club-title").textContent = team.name;
    document.getElementById("club-crumb").textContent = team.name;

    var staffParts = [];
    if (team.manager) staffParts.push("Manager: " + team.manager);
    if (team.coach) staffParts.push("Coach: " + team.coach);
    document.getElementById("club-staff").textContent = staffParts.join("  ·  ");

    if (team.logo) {
      var logoImg = document.getElementById("club-logo");
      logoImg.src = team.logo;
      logoImg.alt = team.name + " crest";
      document.getElementById("club-logo-wrap").hidden = false;
    }

    renderSquad(team.players);
  }

  fetch("data/gfccup.json").then(function (r) { return r.json(); }).then(render).catch(function (err) {
    console.error("Could not load GFC Cup data", err);
  });
})();
