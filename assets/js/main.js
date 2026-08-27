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

  // Elements driven by the one-time hero entrance sequence are skipped by
  // the generic pass and handled separately (see runHeroEntrance / the
  // "already played" branch below).
  var HERO_SKIP_IDS = { heroEyebrow: true, heroTwText: true };

  function applyDict(dict) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      if (HERO_SKIP_IDS[el.id]) return;
      var key = el.getAttribute("data-i18n");
      if (Object.prototype.hasOwnProperty.call(dict, key)) {
        el.textContent = dict[key];
      }
    });
  }

  // ---- Hero entrance (logo bounce/scale/rush + typewriter + shine) ----

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var heroPlayed = false;

  var heroEyebrow = document.getElementById("heroEyebrow");
  var hLetter1 = document.getElementById("hLetter1");
  var hLetter2 = document.getElementById("hLetter2");
  var hLetter3 = document.getElementById("hLetter3");
  var hSegD = document.getElementById("hSegD");
  var hSegLabs = document.getElementById("hSegLabs");
  var heroShine = document.getElementById("heroShine");
  var heroTwWrap = document.getElementById("heroTwWrap");
  var heroTwText = document.getElementById("heroTwText");
  var heroTwCursor = document.getElementById("heroTwCursor");
  var heroCta = document.getElementById("heroCta");

  var heroTimers = [];
  var heroRafIds = [];
  var heroTypeAnim = null;

  function interp(stops, t) {
    for (var i = 0; i < stops.length - 1; i++) {
      var a = stops[i], b = stops[i + 1];
      if (t <= b[0]) {
        var localT = (b[0] === a[0]) ? 1 : (t - a[0]) / (b[0] - a[0]);
        return a[1] + (b[1] - a[1]) * localT;
      }
    }
    return stops[stops.length - 1][1];
  }

  var easeLinear = function (p) { return p; };
  var easeOutQuad = function (p) { return 1 - (1 - p) * (1 - p); };
  var easeOutCubic = function (p) { return 1 - Math.pow(1 - p, 3); };

  var BOUNCE_X = [[0, -160], [0.32, 16], [0.48, -9], [0.62, 5], [0.76, -3], [0.88, 1], [1, 0]];
  var D_SCALE = [[0, 10], [0.7, 0.85], [0.85, 1.08], [1, 1]];
  var LABS_X = [[0, 320], [0.75, -8], [1, 0]];
  var LABS_SKEW = [[0, -18], [0.75, 3], [1, 0]];

  function tween(el, duration, ease, buildTransform) {
    el.style.visibility = "visible";
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.style.transform = buildTransform(ease(p));
      if (p < 1) {
        heroRafIds.push(requestAnimationFrame(frame));
      } else {
        el.style.transform = buildTransform(1);
      }
    }
    heroRafIds.push(requestAnimationFrame(frame));
  }

  function fadeInEyebrow() {
    heroEyebrow.style.visibility = "visible";
  }

  function startLetter(el) {
    tween(el, 900, easeLinear, function (e) {
      return "translateX(" + interp(BOUNCE_X, e).toFixed(2) + "px)";
    });
  }

  function startD(el) {
    tween(el, 900, easeOutQuad, function (e) {
      return "scale(" + interp(D_SCALE, e).toFixed(3) + ")";
    });
  }

  function startLabs(el) {
    tween(el, 950, easeOutCubic, function (e) {
      var x = interp(LABS_X, e).toFixed(2);
      var sk = interp(LABS_SKEW, e).toFixed(2);
      return "translateX(" + x + "px) skewX(" + sk + "deg)";
    });
  }

  heroShine.addEventListener("animationend", function () {
    heroShine.classList.remove("shine-go");
  });
  function playShine() {
    heroShine.classList.remove("shine-go");
    void heroShine.offsetWidth;
    heroShine.classList.add("shine-go");
  }

  function schedule(fn, delay) {
    heroTimers.push(setTimeout(fn, delay));
  }

  function startHeroTypewriter() {
    var naturalWidth = heroTwText.scrollWidth;
    var text = heroTwText.textContent;
    var charCount = Math.max(text.length, 1);
    var duration = Math.min(2100, Math.max(800, charCount * 73));

    heroTypeAnim = heroTwWrap.animate(
      [{ width: "0px" }, { width: naturalWidth + "px" }],
      { duration: duration, easing: "steps(" + charCount + ", end)", fill: "forwards" }
    );

    heroTypeAnim.finished.then(function () {
      heroTwWrap.style.width = "auto";
      heroTwCursor.style.opacity = "1";
      heroCta.classList.add("in");
      schedule(playShine, 250);
    }).catch(function () {});
  }

  // timeline (ms) — 3rd letter of AMA enters first, then 2nd, then 1st
  var T_EYEBROW = 0;
  var T_FIRST_IN = 300;   // letter3
  var T_SECOND_IN = 500;  // letter2
  var T_THIRD_IN = 700;   // letter1
  var T_D = 1000;
  var T_LABS = 1800;
  var T_TYPE = 2900;

  function playHeroInstant() {
    [heroEyebrow, hLetter1, hLetter2, hLetter3, hSegD, hSegLabs].forEach(function (el) {
      el.style.visibility = "visible";
      el.style.transform = "none";
    });
    heroTwWrap.style.width = "auto";
    heroTwCursor.style.opacity = "1";
    heroCta.classList.add("in");
  }

  function runHeroEntrance(eyebrowText, taglineText) {
    heroEyebrow.textContent = eyebrowText;
    heroTwText.textContent = taglineText;
    heroShine.textContent = "AMAD Labs";

    if (reduceMotion) {
      playHeroInstant();
      return;
    }

    schedule(fadeInEyebrow, T_EYEBROW);
    schedule(function () { startLetter(hLetter3); }, T_FIRST_IN);
    schedule(function () { startLetter(hLetter2); }, T_SECOND_IN);
    schedule(function () { startLetter(hLetter1); }, T_THIRD_IN);
    schedule(function () { startD(hSegD); }, T_D);
    schedule(function () { startLabs(hSegLabs); }, T_LABS);
    schedule(startHeroTypewriter, T_TYPE);
  }

  // ---- Language loading ----

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

        if (!heroPlayed) {
          heroPlayed = true;
          runHeroEntrance(dict["hero.eyebrow"], dict["hero.tagline"]);
        } else {
          // Language toggled after the entrance already played: just swap
          // the text instantly, no replay of the animation.
          heroEyebrow.textContent = dict["hero.eyebrow"];
          heroTwText.textContent = dict["hero.tagline"];
          heroTwWrap.style.width = "auto";
        }
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
