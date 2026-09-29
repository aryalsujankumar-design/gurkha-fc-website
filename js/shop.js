/* Renders the Shop page (product grid) from data/shop.json */
(function () {
  var ORDER_EMAIL = "gurkhafc2008@yahoo.com";
  var NA = "Not applicable";

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    }
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function needsSizeChoice(sizes) {
    if (!sizes || !sizes.length) return false;
    if (sizes.length === 1 && sizes[0] === NA) return false;
    return true;
  }

  function buildMailto(item, size) {
    var subject = "Merchandise enquiry: " + item.name;
    var lines = [
      "Hi Gurkha FC,",
      "",
      "I'd like to order:",
      "Item: " + item.name,
      "Price: " + (item.price || ""),
    ];
    if (size) lines.push("Size: " + size);
    lines.push("", "Please let me know availability and how to pay / collect.", "", "Thanks!");
    var body = lines.join("\n");
    return "mailto:" + ORDER_EMAIL +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(body);
  }

  function renderCard(item) {
    var card = el("div", { "class": "shop-card" });

    var media = el("div", { "class": "shop-media" });
    if (item.image) {
      media.appendChild(el("img", { src: item.image, alt: item.name }));
    } else {
      media.style.background = "linear-gradient(135deg, #0F2A57, #184691)";
    }
    card.appendChild(media);

    var info = el("div", { "class": "shop-info" });
    info.appendChild(el("h3", {}, item.name));
    if (item.price) info.appendChild(el("div", { "class": "shop-price" }, item.price));
    if (item.description) info.appendChild(el("p", { "class": "shop-desc" }, item.description));

    var sizeSelect = null;
    if (needsSizeChoice(item.sizes)) {
      var field = el("div", { "class": "shop-size-field" });
      var labelId = "size-label-" + item.id;
      field.appendChild(el("label", { "for": "size-" + item.id, id: labelId }, "Size"));
      sizeSelect = el("select", { id: "size-" + item.id, "class": "shop-size-select" });
      item.sizes.forEach(function (s) {
        sizeSelect.appendChild(el("option", { value: s }, s));
      });
      field.appendChild(sizeSelect);
      info.appendChild(field);
    } else if (item.sizes && item.sizes.length && item.sizes[0] === NA) {
      info.appendChild(el("div", { "class": "shop-size-na" }, "One size / not applicable"));
    }

    var btn = el("a", { "class": "btn btn-primary shop-order-btn", href: "#" }, "Enquire to order");
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var size = sizeSelect ? sizeSelect.value : null;
      window.location.href = buildMailto(item, size);
    });
    info.appendChild(btn);

    card.appendChild(info);
    return card;
  }

  function render(data) {
    var grid = document.getElementById("shop-grid");
    if (!grid) return;
    var items = data.items || [];

    if (!items.length) {
      grid.appendChild(el("p", { "class": "shop-empty" }, "Merchandise is coming soon — check back shortly."));
      return;
    }

    items.forEach(function (item) {
      grid.appendChild(renderCard(item));
    });
  }

  fetch("data/shop.json").then(function (r) { return r.json(); }).then(render).catch(function (err) {
    console.error("Could not load shop data", err);
  });
})();
