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
  var heroGradientText = document.getElementById("heroGradientText");
  var heroShine = document.getElementById("heroShine");
  var heroLogoLine = document.getElementById("heroLogoLine");
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
    }).catch(function () {});
  }

  function settleAndShine() {
    entranceSettled = true;
    applyHeroTheme(currentTheme);
    playShine();
  }

  // timeline (ms) — 3rd letter of AMA enters first, then 2nd, then 1st;
  // the logo settles + shine plays, THEN the tagline types out.
  var T_EYEBROW = 0;
  var T_FIRST_IN = 300;   // letter3
  var T_SECOND_IN = 500;  // letter2
  var T_THIRD_IN = 700;   // letter1
  var T_D = 1000;
  var T_LABS = 1800;      // Labs finishes settling at 1800 + 950 = 2750
  var T_SHINE = 3000;     // shine sweep, duration 2s (see .hero-shine.shine-go)
  var T_TYPE = 4100;      // starts ~1s before the shine sweep fully finishes

  function playHeroInstant() {
    [heroEyebrow, hLetter1, hLetter2, hLetter3, hSegD, hSegLabs].forEach(function (el) {
      el.style.visibility = "visible";
      el.style.transform = "none";
    });
    heroTwWrap.style.width = "auto";
    heroTwCursor.style.opacity = "1";
    heroCta.classList.add("in");
    entranceSettled = true;
    applyHeroTheme(currentTheme);
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
    schedule(settleAndShine, T_SHINE);
    schedule(startHeroTypewriter, T_TYPE);
  }

  // ---- Hero theme (public setting for now — SSO/permissions come later) ----

  var SHINE_WHITE = "linear-gradient(100deg, transparent 25%, rgba(255,255,255,0.65) 42%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.65) 58%, transparent 75%)";

  var currentTheme = null; // { stops: [hex, ...] } or { stops: null }
  var entranceSettled = false;

  function applyHeroTheme(theme) {
    currentTheme = theme;
    if (!entranceSettled) return; // wait for the entrance to finish first

    var stops = theme && theme.stops;
    if (stops && stops.length >= 2) {
      heroGradientText.style.backgroundImage = "linear-gradient(100deg, " + stops.join(", ") + ")";
      heroGradientText.style.opacity = "1";
      heroLogoLine.style.opacity = "0";
      heroShine.style.backgroundImage = SHINE_WHITE;
    } else {
      heroGradientText.style.opacity = "0";
      heroLogoLine.style.opacity = "1";
      heroShine.style.backgroundImage = "";
    }
  }

  function fetchHeroTheme() {
    fetch("/api/theme")
      .then(function (res) { return res.json(); })
      .then(applyHeroTheme)
      .catch(function () {});
  }

  // -- Personal settings panel (opened via the avatar button in nav) --

  var THEME_PRESETS = [
    { id: 11, name: "藍→綠",         stops: ["#5b8def", "#34d399"] },
    { id: 12, name: "紫→粉",         stops: ["#a78bfa", "#f472b6"] },
    { id: 13, name: "橘→黃",         stops: ["#fb923c", "#fbbf24"] },
    { id: 14, name: "紅→紫",         stops: ["#f87171", "#a78bfa"] },
    { id: 15, name: "青→藍",         stops: ["#22d3ee", "#5b8def"] },
    { id: 16, name: "金→橘",         stops: ["#fbbf24", "#fb923c"] },
    { id: 17, name: "綠→青",         stops: ["#34d399", "#22d3ee"] },
    { id: 18, name: "靛→粉",         stops: ["#6366f1", "#f472b6"] },
    { id: 19, name: "灰→藍",         stops: ["#9aa3b0", "#5b8def"] },
    { id: 20, name: "粉→紫→藍",      stops: ["#f472b6", "#a78bfa", "#5b8def"] }
  ];

  // Preview inside the panel replays the same entrance (letters/D/Labs +
  // shine) on its own small set of elements, so picking a color shows both
  // the color AND the motion — not just a static swatch.
  var pvRafIds = [];
  var pvTimers = [];

  function pvTween(el, duration, ease, buildTransform) {
    el.style.visibility = "visible";
    var start = null;
    function frame(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      el.style.transform = buildTransform(ease(p));
      if (p < 1) {
        pvRafIds.push(requestAnimationFrame(frame));
      } else {
        el.style.transform = buildTransform(1);
      }
    }
    pvRafIds.push(requestAnimationFrame(frame));
  }

  function pvClear() {
    pvTimers.forEach(clearTimeout);
    pvTimers = [];
    pvRafIds.forEach(cancelAnimationFrame);
    pvRafIds = [];
  }

  function initThemePanel() {
    var avatarBtn = document.getElementById("avatarBtn");
    var panel = document.getElementById("themePanel");
    var closeBtn = document.getElementById("themePanelClose");
    var swatchGrid = document.getElementById("themeSwatchGrid");
    var pickerRow = document.getElementById("themePickerRow");
    var saveBtn = document.getElementById("themeSave");
    var resetBtn = document.getElementById("themeReset");
    var statusEl = document.getElementById("themeStatus");
    var replayBtn = document.getElementById("themePreviewReplay");

    var tpLetter1 = document.getElementById("tpLetter1");
    var tpLetter2 = document.getElementById("tpLetter2");
    var tpLetter3 = document.getElementById("tpLetter3");
    var tpSegD = document.getElementById("tpSegD");
    var tpSegLabs = document.getElementById("tpSegLabs");
    var tpLogoLine = document.getElementById("tpLogoLine");
    var tpGradientText = document.getElementById("tpGradientText");
    var tpShine = document.getElementById("tpShine");

    if (!avatarBtn || !panel) return;

    var pickerStops = THEME_PRESETS[0].stops.slice();

    function playPreview() {
      pvClear();
      [tpLetter1, tpLetter2, tpLetter3, tpSegD, tpSegLabs].forEach(function (el) {
        el.style.visibility = "hidden";
        el.style.transform = "";
      });
      tpLogoLine.style.opacity = "1";
      tpGradientText.style.opacity = "0";
      tpShine.classList.remove("shine-go");

      var gradientCss = "linear-gradient(100deg, " + pickerStops.join(", ") + ")";
      tpGradientText.style.backgroundImage = gradientCss;
      tpShine.style.backgroundImage = SHINE_WHITE;

      function sched(fn, d) { pvTimers.push(setTimeout(fn, d)); }

      sched(function () {
        pvTween(tpLetter3, 900, easeLinear, function (e) { return "translateX(" + interp(BOUNCE_X, e).toFixed(2) + "px)"; });
      }, 300);
      sched(function () {
        pvTween(tpLetter2, 900, easeLinear, function (e) { return "translateX(" + interp(BOUNCE_X, e).toFixed(2) + "px)"; });
      }, 500);
      sched(function () {
        pvTween(tpLetter1, 900, easeLinear, function (e) { return "translateX(" + interp(BOUNCE_X, e).toFixed(2) + "px)"; });
      }, 700);
      sched(function () {
        pvTween(tpSegD, 900, easeOutQuad, function (e) { return "scale(" + interp(D_SCALE, e).toFixed(3) + ")"; });
      }, 1000);
      sched(function () {
        pvTween(tpSegLabs, 950, easeOutCubic, function (e) {
          var x = interp(LABS_X, e).toFixed(2), sk = interp(LABS_SKEW, e).toFixed(2);
          return "translateX(" + x + "px) skewX(" + sk + "deg)";
        });
      }, 1800);
      sched(function () {
        tpGradientText.style.opacity = "1";
        tpLogoLine.style.opacity = "0";
        void tpShine.offsetWidth;
        tpShine.classList.add("shine-go");
      }, 2900);
    }

    function renderPickerRow() {
      pickerRow.innerHTML = "";
      pickerStops.forEach(function (color, i) {
        var input = document.createElement("input");
        input.type = "color";
        input.value = color;
        input.setAttribute("aria-label", "色 " + (i + 1));
        input.addEventListener("input", function () {
          pickerStops[i] = input.value;
          markActiveSwatch(null);
          playPreview();
        });
        pickerRow.appendChild(input);
      });
    }

    function markActiveSwatch(id) {
      swatchGrid.querySelectorAll(".theme-swatch").forEach(function (btn) {
        btn.classList.toggle("active", btn.getAttribute("data-id") === String(id));
      });
    }

    THEME_PRESETS.forEach(function (preset) {
      var btn = document.createElement("button");
      btn.className = "theme-swatch";
      btn.type = "button";
      btn.setAttribute("data-id", preset.id);
      btn.title = preset.name;
      btn.style.background = "linear-gradient(100deg, " + preset.stops.join(", ") + ")";
      btn.addEventListener("click", function () {
        pickerStops = preset.stops.slice();
        renderPickerRow();
        markActiveSwatch(preset.id);
        playPreview();
      });
      swatchGrid.appendChild(btn);
    });

    renderPickerRow();

    replayBtn.addEventListener("click", playPreview);

    function openPanel() {
      if (currentTheme && currentTheme.stops) {
        pickerStops = currentTheme.stops.slice();
        renderPickerRow();
      }
      panel.hidden = false;
      playPreview();
    }
    function closePanel() { panel.hidden = true; pvClear(); }

    avatarBtn.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);
    panel.addEventListener("click", function (e) {
      if (e.target === panel) closePanel();
    });

    function saveTheme(stops) {
      statusEl.textContent = "儲存中…";
      fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stops: stops })
      })
        .then(function (res) {
          if (!res.ok) throw new Error("儲存失敗");
          return res.json();
        })
        .then(function (theme) {
          statusEl.textContent = "已儲存,所有訪客都會看到這個配色。";
          applyHeroTheme(theme);
        })
        .catch(function (err) {
          statusEl.textContent = err.message || "儲存失敗";
        });
    }

    saveBtn.addEventListener("click", function () { saveTheme(pickerStops); });
    resetBtn.addEventListener("click", function () { saveTheme(null); });
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
    fetchHeroTheme();
    initThemePanel();

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
