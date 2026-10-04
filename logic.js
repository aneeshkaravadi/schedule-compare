/* Pure schedule logic. Works in the browser (global `Logic`) and in Node (require). */
(function (root) {
  'use strict';
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var LIMITS = { name: 40, text: 60, classes: 20, alts: 10 };

  /* "12:20 PM", "9:05am", "14:20", "1420", "9:05". Bare times with no am/pm:
     12 is noon, 1 to 6 is PM, 7 to 11 is AM (class hours at a US campus). */
  function parseTime(str) {
    if (typeof str === 'number') return str >= 0 && str < 1440 ? Math.round(str) : null;
    if (typeof str !== 'string') return null;
    var s = str.trim().toLowerCase().replace(/\./g, '');
    var m = s.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
    if (!m) return null;
    var h = parseInt(m[1], 10), min = m[2] ? parseInt(m[2], 10) : 0, ap = m[3];
    if (min > 59) return null;
    if (ap) {
      if (h < 1 || h > 12) return null;
      var pm = ap[0] === 'p';
      if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12;
    } else if (h <= 12) {
      if (h >= 1 && h <= 6) h += 12;
    } else if (h > 23) return null;
    return h * 60 + min;
  }

  function fmtTime(min) {
    if (min == null) return '';
    var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }

  function normCourse(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function normSection(s) { return String(s || '').trim().toUpperCase(); }
  function hasTime(c) { return c && c.days && c.days.length && c.start != null && c.end != null && c.end > c.start; }

  /* Back-to-back classes (end equals next start) do not overlap. */
  function classesOverlap(a, b) {
    if (!hasTime(a) || !hasTime(b)) return false;
    var share = a.days.some(function (d) { return b.days.indexOf(d) > -1; });
    return share && a.start < b.end && b.start < a.end;
  }

  function conflicts(classes) {
    var out = [];
    for (var i = 0; i < classes.length; i++)
      for (var j = i + 1; j < classes.length; j++)
        if (classesOverlap(classes[i], classes[j])) out.push([i, j]);
    return out;
  }

  function eventsOf(person) {
    var ev = [];
    person.classes.forEach(function (c, idx) {
      if (!hasTime(c)) return;
      c.days.forEach(function (d) { ev.push({ day: d, start: c.start, end: c.end, cls: c, idx: idx }); });
    });
    return ev;
  }

  /* ---- sanitising (share links come from other people) ---- */
  function str(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, '').slice(0, n) : ''; }
  function cleanClass(c) {
    if (!c || typeof c !== 'object') return null;
    var days = Array.isArray(c.days) ? c.days.filter(function (d, i, a) { return Number.isInteger(d) && d >= 0 && d <= 4 && a.indexOf(d) === i; }).sort() : [];
    var s = parseTime(c.start), e = parseTime(c.end);
    var out = { course: str(c.course, LIMITS.text), section: str(c.section, LIMITS.text), nbr: str(c.nbr, LIMITS.text),
      days: days, start: s, end: e, room: str(c.room, LIMITS.text), instructor: str(c.instructor, LIMITS.text) };
    return out;
  }
  function cleanPerson(p) {
    if (!p || typeof p !== 'object') return null;
    var classes = (Array.isArray(p.classes) ? p.classes : []).slice(0, LIMITS.classes).map(function (c) {
      var cc = cleanClass(c); if (!cc) return null;
      cc.alts = (Array.isArray(c.alts) ? c.alts : []).slice(0, LIMITS.alts).map(cleanClass).filter(Boolean);
      return cc;
    }).filter(Boolean);
    return { name: str(p.name, LIMITS.name) || 'Friend', classes: classes };
  }

  /* ---- share links ---- */
  function toB64(s) {
    var b = typeof Buffer !== 'undefined' ? Buffer.from(s, 'utf8').toString('base64')
      : btoa(unescape(encodeURIComponent(s)));
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return typeof Buffer !== 'undefined' ? Buffer.from(s, 'base64').toString('utf8')
      : decodeURIComponent(escape(atob(s)));
  }
  function encodeShare(person) {
    return toB64(JSON.stringify({ v: 1, p: cleanPerson(person) }));
  }
  /* Accepts a full link, "#s=code", "s=code" or the bare code. Returns a clean person or null. */
  function decodeShare(text) {
    if (typeof text !== 'string') return null;
    var t = text.trim();
    var m = t.match(/[#?&]s=([A-Za-z0-9_-]+)/) || t.match(/^s=([A-Za-z0-9_-]+)$/);
    var code = m ? m[1] : (/^[A-Za-z0-9_-]+$/.test(t) ? t : null);
    if (!code) return null;
    try {
      var o = JSON.parse(fromB64(code));
      return o && o.v === 1 ? cleanPerson(o.p) : null;
    } catch (e) { return null; }
  }

  /* ---- comparing ---- */
  function sectionLabel(c) { return normSection(c.section) || '(no section)'; }

  /* Courses that two or more people have, grouped by section. */
  function sharedClasses(people) {
    var map = {};
    people.forEach(function (p, pi) {
      p.classes.forEach(function (c) {
        var k = normCourse(c.course); if (!k) return;
        (map[k] = map[k] || { key: k, course: c.course.trim(), entries: [] }).entries.push({ pi: pi, person: p.name, cls: c });
      });
    });
    return Object.keys(map).map(function (k) { return map[k]; }).filter(function (g) {
      return new Set(g.entries.map(function (e) { return e.pi; })).size >= 2;
    }).map(function (g) {
      var bySec = {};
      g.entries.forEach(function (e) { (bySec[sectionLabel(e.cls)] = bySec[sectionLabel(e.cls)] || []).push(e.person); });
      var secs = Object.keys(bySec);
      return { key: g.key, course: g.course, entries: g.entries, bySection: bySec, sameSection: secs.length === 1 };
    }).sort(function (a, b) { return (b.sameSection - a.sameSection) || a.course.localeCompare(b.course); });
  }

  /* For each person in a course that people are split across, suggest the section that
     puts them with the most others, preferring switches that cause no time conflict. */
  function suggestions(people) {
    var out = [];
    var groups = sharedClasses(people).filter(function (g) { return !g.sameSection; });
    groups.forEach(function (g) {
      var cands = {};   // section -> class with times (first one that has times wins)
      people.forEach(function (p) {
        p.classes.forEach(function (c) {
          if (normCourse(c.course) !== g.key) return;
          [c].concat(c.alts || []).forEach(function (x) {
            var s = sectionLabel(x);
            if (!cands[s] || (!hasTime(cands[s]) && hasTime(x))) cands[s] = x;
          });
        });
      });
      g.entries.forEach(function (e) {
        var me = people[e.pi], mine = sectionLabel(e.cls), best = null;
        Object.keys(cands).forEach(function (sec) {
          if (sec === mine) return;
          var joining = g.entries.filter(function (o) { return o.pi !== e.pi && sectionLabel(o.cls) === sec; }).map(function (o) { return o.person; });
          if (!joining.length) return;
          var target = cands[sec];
          var others = me.classes.filter(function (c) { return c !== e.cls; });
          var clash = others.filter(function (c) { return classesOverlap(target, c); });
          var cand = { person: e.person, pi: e.pi, course: g.course, from: mine, to: sec, target: target, joining: joining, clashes: clash.map(function (c) { return c.course + ' ' + sectionLabel(c); }) };
          var better = !best || (cand.clashes.length < best.clashes.length) ||
            (cand.clashes.length === best.clashes.length && cand.joining.length > best.joining.length);
          if (better) best = cand;
        });
        if (best) out.push(best);
      });
    });
    return out.sort(function (a, b) { return (a.clashes.length - b.clashes.length) || (b.joining.length - a.joining.length) || a.person.localeCompare(b.person); });
  }

  var api = { DAYS: DAYS, parseTime: parseTime, fmtTime: fmtTime, normCourse: normCourse, normSection: normSection, hasTime: hasTime,
    classesOverlap: classesOverlap, conflicts: conflicts, eventsOf: eventsOf, cleanPerson: cleanPerson, cleanClass: cleanClass,
    encodeShare: encodeShare, decodeShare: decodeShare, sharedClasses: sharedClasses, suggestions: suggestions, sectionLabel: sectionLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Logic = api;
})(typeof self !== 'undefined' ? self : this);
