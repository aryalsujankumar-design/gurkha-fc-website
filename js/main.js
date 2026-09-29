function GFC_initTabs() {
  var tabBtns = document.querySelectorAll(".tab-btn");
  if (!tabBtns.length) return;
  tabBtns.forEach(function (btn) {
    if (btn._gfcBound) return;
    btn._gfcBound = true;
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-tab");

      document.querySelectorAll(".tab-btn").forEach(function (b) {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });

      document.querySelectorAll(".tab-panel").forEach(function (panel) {
        panel.hidden = panel.id !== "tab-" + target;
      });
    });
  });
}
window.GFC_initTabs = GFC_initTabs;

document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      nav.classList.toggle("open");
      var expanded = nav.classList.contains("open");
      toggle.setAttribute("aria-expanded", expanded);
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
      });
    });
  }

  // Achievements page: Interstate / Queensland tabs (Gallery page tabs are bound after their
  // content loads, via GFC_initTabs called from js/gallery.js)
  GFC_initTabs();

  var form = document.querySelector(".contact-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = form.querySelector(".form-status");
      if (status) {
        status.textContent = "Thanks for reaching out — we'll be in touch soon.";
        status.style.display = "block";
      }
    });
  }
});
