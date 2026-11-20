/* Cyber Labs page logic: builds the machine list and launch links from config.js. */
(function () {
  "use strict";

  var cfg = window.LAB_CONFIG || {};
  var environments = cfg.environments || [];
  var courses = cfg.courses || [];
  var machines = cfg.machines || {};
  var STORE_KEY = "cyberlabs.course";

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        if (attrs[key] !== undefined && attrs[key] !== null) node.setAttribute(key, attrs[key]);
      });
    }
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /* Work out which GitHub repository holds the dev containers. */
  function findRepository() {
    var valid = /^[A-Za-z0-9_.-]+$/;
    var params = new URLSearchParams(window.location.search);
    var override = params.get("repo");
    if (override) {
      var parts = override.split("/");
      if (parts.length === 2 && valid.test(parts[0]) && valid.test(parts[1])) {
        return { owner: parts[0], repo: parts[1] };
      }
    }
    if (cfg.owner && cfg.repo) return { owner: cfg.owner, repo: cfg.repo };
    var host = window.location.hostname.match(/^([A-Za-z0-9-]+)\.github\.io$/);
    if (host) {
      var first = window.location.pathname.split("/").filter(Boolean)[0];
      var isPage = !first || /\.html?$/i.test(first);
      return { owner: host[1], repo: isPage ? host[1] + ".github.io" : first };
    }
    return null;
  }

  var repository = findRepository();

  function launchUrl(env, machine) {
    if (!repository) return null;
    var query = new URLSearchParams();
    query.set("quickstart", "1");
    query.set("devcontainer_path", env.devcontainerPath);
    if (machine) query.set("machine", machine);
    return "https://codespaces.new/" + repository.owner + "/" + repository.repo + "?" + query.toString();
  }

  function machineLabel(name) {
    return machines[name] ? machines[name].label : "";
  }

  function readCourse() {
    try { return window.localStorage.getItem(STORE_KEY) || ""; } catch (e) { return ""; }
  }

  function saveCourse(id) {
    try {
      if (id) window.localStorage.setItem(STORE_KEY, id);
      else window.localStorage.removeItem(STORE_KEY);
    } catch (e) { /* storage is optional */ }
  }

  function courseById(id) {
    for (var i = 0; i < courses.length; i++) if (courses[i].id === id) return courses[i];
    return null;
  }

  function buildMachine(env, course) {
    var inCourse = course ? course.environments.indexOf(env.id) !== -1 : true;
    var item = el("li", { "class": "machine" + (inCourse ? "" : " is-other"), "data-env": env.id });

    var about = el("div", { "class": "machine-about" });
    var nameRow = el("div", { "class": "machine-name" });
    nameRow.appendChild(el("h3", null, env.name));
    nameRow.appendChild(el("span", { "class": "family", "data-family": env.family }, env.family === "windows" ? "Windows" : "Kali Linux"));
    if (course && inCourse) nameRow.appendChild(el("span", { "class": "tag tag-course" }, "Used in " + course.code));
    if (env.status === "beta") nameRow.appendChild(el("span", { "class": "tag" }, "Beta"));
    about.appendChild(nameRow);
    about.appendChild(el("p", { "class": "machine-summary" }, env.summary));
    if (env.status === "beta") {
      about.appendChild(el("p", { "class": "beta-note" }, "Beta: this machine is new. Tell your instructor if it does not start."));
    }
    item.appendChild(about);

    var facts = el("ul", { "class": "machine-facts" });
    [machineLabel(env.machine), env.firstStart, env.signIn, env.opens].forEach(function (fact) {
      if (fact) facts.appendChild(el("li", null, fact));
    });
    item.appendChild(facts);

    var go = el("div", { "class": "machine-go" });
    var url = launchUrl(env, env.machine);
    var button = el("a", { "class": "launch", target: "_blank", rel: "noopener" }, "Launch " + env.name);
    if (url) button.setAttribute("href", url);
    else button.setAttribute("aria-disabled", "true");
    go.appendChild(button);
    if (env.altMachine && machines[env.altMachine]) {
      var altUrl = launchUrl(env, env.altMachine);
      var alt = el("a", { "class": "launch-alt", target: "_blank", rel: "noopener" },
        "Use " + machines[env.altMachine].cores + " cores instead (slower, uses half the hours)");
      if (altUrl) alt.setAttribute("href", altUrl);
      go.appendChild(alt);
    }
    item.appendChild(go);
    return item;
  }

  function renderRoster(courseId) {
    var roster = document.getElementById("roster");
    if (!roster) return;
    var course = courseById(courseId);
    var ordered = environments.slice();
    if (course) {
      ordered.sort(function (a, b) {
        var ia = course.environments.indexOf(a.id);
        var ib = course.environments.indexOf(b.id);
        if (ia === -1 && ib === -1) return environments.indexOf(a) - environments.indexOf(b);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      });
    }
    roster.textContent = "";
    ordered.forEach(function (env) { roster.appendChild(buildMachine(env, course)); });

    var note = document.getElementById("course-note");
    if (note) {
      note.textContent = course
        ? course.code + ", " + course.title + ". Its machines are listed first."
        : "";
    }
  }

  function renderChips(selected) {
    var holder = document.getElementById("course-chips");
    if (!holder) return;
    holder.textContent = "";
    var all = [{ id: "", code: "All machines" }].concat(courses);
    all.forEach(function (course) {
      var chip = el("button", { type: "button", "class": "chip", "aria-pressed": String(course.id === selected) }, course.code);
      if (course.title) chip.setAttribute("title", course.title);
      chip.addEventListener("click", function () {
        saveCourse(course.id);
        renderChips(course.id);
        renderRoster(course.id);
      });
      holder.appendChild(chip);
    });
  }

  function renderHours() {
    var body = document.getElementById("hours-body");
    if (!body) return;
    var free = cfg.freeCoreHours || 120;
    var student = cfg.studentCoreHours || 180;
    Object.keys(machines).forEach(function (name) {
      var users = {};
      environments.forEach(function (env) {
        if (env.machine === name) users[env.family === "windows" ? "Windows machines" : "Kali machines"] = true;
      });
      var cores = machines[name].cores;
      var row = el("tr");
      row.appendChild(el("th", { scope: "row" }, cores + " cores"));
      row.appendChild(el("td", null, Object.keys(users).join(", ") || "Optional"));
      row.appendChild(el("td", { "class": "num" }, String(Math.floor(free / cores))));
      row.appendChild(el("td", { "class": "num" }, String(Math.floor(student / cores))));
      body.appendChild(row);
    });
  }

  function renderText() {
    var siteName = document.getElementById("site-name");
    if (siteName && cfg.siteName) siteName.textContent = cfg.siteName;
    var maintainer = document.getElementById("maintainer");
    if (maintainer && cfg.maintainer) maintainer.textContent = cfg.maintainer;
    var notice = document.getElementById("setup-notice");
    if (notice && !repository) {
      notice.hidden = false;
      notice.textContent = "The launch buttons are off because this page is not on GitHub Pages yet. Publish the site, or set owner and repo in config.js.";
    }
  }

  var saved = readCourse();
  if (!courseById(saved)) saved = "";
  renderText();
  renderChips(saved);
  renderRoster(saved);
  renderHours();
})();
