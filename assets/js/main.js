(function () {
  "use strict";

  var SUPPORTED_LANGS = ["zh", "en"];
  var DEFAULT_LANG = "zh";
  var STORAGE_KEY = "lang";

  function getStoredLang() {
    try {
      var lang = localStorage.getItem(STORAGE_KEY);
      return SUPPORTED_LANGS.indexOf(lang) !== -1 ? lang : DEFAULT_LANG;
    } catch (e) {
      return DEFAULT_LANG;
    }
  }

  function storeLang(lang) {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e) {
      /* localStorage unavailable, ignore */
    }
  }

  function applyDict(dict) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        el.textContent = dict[key];
      }
    });
  }

  function setLang(lang) {
    var htmlLang = lang === "zh" ? "zh-Hant" : "en";
    document.documentElement.setAttribute("lang", htmlLang);

    fetch("i18n/" + lang + ".json")
      .then(function (res) {
        if (!res.ok) throw new Error("Failed to load " + lang + ".json");
        return res.json();
      })
      .then(function (dict) {
        applyDict(dict);
        document.title = dict["meta.title"] || document.title;
        storeLang(lang);
      })
      .catch(function (err) {
        console.error(err);
      });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var currentLang = getStoredLang();
    setLang(currentLang);

    var langToggle = document.getElementById("langToggle");
    if (langToggle) {
      langToggle.addEventListener("click", function () {
        currentLang = currentLang === "zh" ? "en" : "zh";
        setLang(currentLang);
      });
    }

    var navToggle = document.getElementById("navToggle");
    var siteNav = document.getElementById("siteNav");
    if (navToggle && siteNav) {
      navToggle.addEventListener("click", function () {
        var isOpen = siteNav.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      });

      siteNav.querySelectorAll("a").forEach(function (link) {
        link.addEventListener("click", function () {
          siteNav.classList.remove("open");
          navToggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  });
})();
