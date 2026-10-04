(function () {
  'use strict';
  var L = window.Logic, DAYS = L.DAYS, KEY = 'schedule-compare.v1';
  var state = { me: { name: '', classes: [] }, friends: [] };

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k]; else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return n;
  }
  var $ = function (id) { return document.getElementById(id); };
  var uid = 0;

  /* ---- state ---- */
  function blankClass() { return { course: '', section: '', nbr: '', days: [], startText: '', endText: '', room: '', instructor: '', alts: [] }; }
  function blankAlt() { return { section: '', nbr: '', days: [], startText: '', endText: '', room: '' }; }
  function fromClean(c) {
    return { course: c.course, section: c.section, nbr: c.nbr, days: c.days.slice(), startText: c.start == null ? '' : L.fmtTime(c.start),
      endText: c.end == null ? '' : L.fmtTime(c.end), room: c.room, instructor: c.instructor, alts: (c.alts || []).map(fromClean) };
  }
  function toLogic(person) {
    return L.cleanPerson({ name: person.name || 'Me', classes: person.classes.map(function (c) {
      var o = { course: c.course, section: c.section, nbr: c.nbr, days: c.days, start: c.startText, end: c.endText, room: c.room, instructor: c.instructor };
      o.alts = (c.alts || []).map(function (a) { return { course: c.course, section: a.section, nbr: a.nbr, days: a.days, start: a.startText, end: a.endText, room: a.room }; });
      return o;
    }) });
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.me && Array.isArray(s.me.classes)) {
        state.me = { name: String(s.me.name || '').slice(0, 40), classes: s.me.classes.slice(0, 20).map(function (c) { return Object.assign(blankClass(), c, { alts: (c.alts || []).map(function (a) { return Object.assign(blankAlt(), a); }) }); }) };
        state.friends = (s.friends || []).map(function (f) { return L.cleanPerson(f); }).filter(Boolean).slice(0, 12);
      }
    } catch (e) {}
  }

  /* ---- weekly grid ---- */
  function renderGrid(host, people) {
    var all = [];
    people.forEach(function (p) { L.eventsOf(p).forEach(function (e) { all.push(e); }); });
    var lo = 8 * 60, hi = 18 * 60;
    all.forEach(function (e) { lo = Math.min(lo, Math.floor(e.start / 60) * 60); hi = Math.max(hi, Math.ceil(e.end / 60) * 60); });
    var PX = 44, h = (hi - lo) / 60 * PX;
    host.innerHTML = '';
    var grid = el('div', { class: 'cal' });
    grid.appendChild(el('div'));
    DAYS.forEach(function (d) { grid.appendChild(el('div', { class: 'dayhead', text: d })); });
    var hours = el('div', { class: 'hours', style: 'height:' + h + 'px' });
    for (var m = lo; m <= hi; m += 60) hours.appendChild(el('span', { style: 'top:' + ((m - lo) / 60 * PX) + 'px', text: L.fmtTime(m).replace(':00', '') }));
    grid.appendChild(hours);
    for (var d = 0; d < 5; d++) {
      var col = el('div', { class: 'col', style: 'height:' + h + 'px' });
      for (var k = lo + 60; k < hi; k += 60) col.appendChild(el('div', { class: 'line', style: 'top:' + ((k - lo) / 60 * PX) + 'px' }));
      var n = people.length;
      people.forEach(function (p, pi) {
        var evs = L.eventsOf(p).filter(function (e) { return e.day === d; });
        var clashIdx = {};
        L.conflicts(p.classes).forEach(function (pr) { clashIdx[pr[0]] = clashIdx[pr[1]] = 1; });
        evs.forEach(function (e) {
          var top = (e.start - lo) / 60 * PX + 1, ht = (e.end - e.start) / 60 * PX - 2, w = 100 / n;
          var title = (e.cls.course || 'Class') + (e.cls.section ? ' ' + e.cls.section : '');
          var node = el('div', { class: 'ev' + (clashIdx[e.idx] ? ' clash' : ''), style: '--c:var(--p' + (pi % 6) + ');top:' + top + 'px;height:' + ht + 'px;left:calc(' + (pi * w) + '% + 2px);width:calc(' + w + '% - 4px)',
            title: (n > 1 ? p.name + ': ' : '') + title + ', ' + L.fmtTime(e.start) + ' to ' + L.fmtTime(e.end) }, [
            el('b', { text: title }), el('span', { text: L.fmtTime(e.start) + ' to ' + L.fmtTime(e.end) }),
            ht >= 52 && e.cls.room ? el('span', { text: e.cls.room }) : null]);
          col.appendChild(node);
        });
      });
      grid.appendChild(col);
    }
    host.appendChild(grid);
  }

  /* ---- editor ---- */
  function field(label, input, id) { return el('div', {}, [el('label', { for: id, text: label }), input]); }
  function textInput(obj, key, id, ph, onchange) {
    var i = el('input', { type: 'text', id: id, placeholder: ph || '', maxlength: '60', autocomplete: 'off' });
    i.value = obj[key] || '';
    i.addEventListener('input', function () { obj[key] = i.value; onchange && onchange(i); update(); });
    return i;
  }
  function timeInput(obj, key, id) {
    return textInput(obj, key, id, '9:05 AM', function (i) { i.classList.toggle('bad', !!i.value.trim() && L.parseTime(i.value) == null); });
  }
  function daysInput(obj, id) {
    var wrap = el('div', { class: 'days', role: 'group', 'aria-label': 'Days' });
    DAYS.forEach(function (d, di) {
      var cb = el('input', { type: 'checkbox', id: id + '-' + di });
      cb.checked = obj.days.indexOf(di) > -1;
      cb.addEventListener('change', function () {
        obj.days = obj.days.filter(function (x) { return x !== di; });
        if (cb.checked) obj.days.push(di);
        obj.days.sort(); update();
      });
      wrap.appendChild(el('label', { for: id + '-' + di }, [cb, d]));
    });
    return wrap;
  }
  function renderEditor() {
    var host = $('classes'); host.innerHTML = '';
    state.me.classes.forEach(function (c, ci) {
      var p = 'c' + ci + '-' + (++uid);
      var card = el('div', { class: 'class' });
      card.appendChild(el('div', { class: 'class-head' }, [el('b', { text: 'Class ' + (ci + 1) }),
        el('button', { type: 'button', class: 'btn small', text: 'Remove', onclick: function () { state.me.classes.splice(ci, 1); renderEditor(); update(); } })]));
      card.appendChild(el('div', { class: 'row top' }, [
        field('Course', textInput(c, 'course', p + 'course', 'MATH 2730'), p + 'course'),
        field('Section', textInput(c, 'section', p + 'sec', '003'), p + 'sec'),
        field('Class number (optional)', textInput(c, 'nbr', p + 'nbr', '6571'), p + 'nbr')]));
      card.appendChild(el('div', { class: 'row top' }, [
        el('div', {}, [el('label', { text: 'Days' }), daysInput(c, p + 'd')]),
        field('Start', timeInput(c, 'startText', p + 's'), p + 's'),
        field('End', timeInput(c, 'endText', p + 'e'), p + 'e')]));
      card.appendChild(el('div', { class: 'row' }, [
        field('Room (optional)', textInput(c, 'room', p + 'room', 'Gab 112'), p + 'room'),
        field('Instructor (optional)', textInput(c, 'instructor', p + 'inst', ''), p + 'inst')]));
      var det = el('details', { class: 'alts' }, [el('summary', { text: 'Other sections of this course you could take (' + c.alts.length + ')' })]);
      if (c.alts.length) det.open = true;
      c.alts.forEach(function (a, ai) {
        var q = p + 'a' + ai;
        det.appendChild(el('div', { class: 'alt' }, [
          el('div', { class: 'row top' }, [field('Section', textInput(a, 'section', q + 'sec', '001'), q + 'sec'), field('Class number', textInput(a, 'nbr', q + 'nbr', ''), q + 'nbr'),
            field('Room', textInput(a, 'room', q + 'room', ''), q + 'room')]),
          el('div', { class: 'row' }, [el('div', {}, [el('label', { text: 'Days' }), daysInput(a, q + 'd')]), field('Start', timeInput(a, 'startText', q + 's'), q + 's'), field('End', timeInput(a, 'endText', q + 'e'), q + 'e'),
            el('div', {}, [el('button', { type: 'button', class: 'btn small', text: 'Remove', onclick: function () { c.alts.splice(ai, 1); renderEditor(); update(); } })])])]));
      });
      det.appendChild(el('div', { class: 'hint', text: 'Sections you list here can be suggested as swaps to match a friend.' }));
      det.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Add another section', onclick: function () { c.alts.push(blankAlt()); renderEditor(); update(); } }));
      card.appendChild(det);
      host.appendChild(card);
    });
    if (!state.me.classes.length) host.appendChild(el('p', { class: 'empty', text: 'No classes yet. Add your first one below.' }));
  }

  /* ---- compare ---- */
  function everyone() { return [toLogic(state.me)].concat(state.friends); }
  function secText(c) { return L.hasTime(c) ? c.days.map(function (d) { return DAYS[d]; }).join('/') + ' ' + L.fmtTime(c.start) + ' to ' + L.fmtTime(c.end) + (c.room ? ', ' + c.room : '') : 'no meeting time'; }

  function renderCompare() {
    var ppl = everyone();
    $('cmp-count').textContent = state.friends.length ? '(' + (state.friends.length + 1) + ')' : '';
    var people = $('people'); people.innerHTML = '';
    ppl.forEach(function (p, i) {
      var chip = el('span', { class: 'chip', style: '--c:var(--p' + (i % 6) + ')' }, [el('span', { text: p.name + (i === 0 ? ' (you)' : '') })]);
      if (i > 0) chip.appendChild(el('button', { type: 'button', 'aria-label': 'Remove ' + p.name, text: '×', onclick: function () { state.friends.splice(i - 1, 1); save(); update(); } }));
      people.appendChild(chip);
    });
    var body = $('cmp-body'); body.innerHTML = '';
    if (ppl.length < 2) {
      body.appendChild(el('p', { class: 'empty', text: 'Add a friend above to see the overlay, shared classes and section suggestions.' }));
      body.appendChild(el('button', { type: 'button', class: 'btn', text: 'Try it with example friends', onclick: loadExample }));
      return;
    }
    body.appendChild(el('h2', { text: 'Everyone this week' }));
    var wrap = el('div', { class: 'cal-wrap' }); var g = el('div'); wrap.appendChild(g); body.appendChild(wrap); renderGrid(g, ppl);

    body.appendChild(el('h2', { text: 'Classes you share' }));
    var shared = L.sharedClasses(ppl);
    if (!shared.length) body.appendChild(el('p', { class: 'empty', text: 'No course appears in more than one schedule yet.' }));
    shared.forEach(function (s) {
      var card = el('div', { class: 'card' }, [el('h3', {}, [s.course, el('span', { class: 'tag ' + (s.sameSection ? 'good' : 'warn'), text: s.sameSection ? 'Same section' : 'Different sections' })])]);
      Object.keys(s.bySection).forEach(function (sec) { card.appendChild(el('div', { class: 'sec-line', text: 'Section ' + sec + ': ' + s.bySection[sec].join(', ') })); });
      body.appendChild(card);
    });

    body.appendChild(el('h2', { text: 'Suggested section changes' }));
    var sug = L.suggestions(ppl);
    if (!sug.length) body.appendChild(el('p', { class: 'empty', text: shared.some(function (s) { return !s.sameSection; }) ? 'No swap would put anyone with a friend using the sections entered so far. Add other sections under a class to widen the search.' : 'Nothing to change. Everyone sharing a class is already in the same section.' }));
    sug.forEach(function (s) {
      var card = el('div', { class: 'card sug' }, [
        el('div', {}, [el('b', { text: s.person }), ' could move ', el('b', { text: s.course }), ' from section ' + s.from + ' to ', el('b', { text: s.to }), ' to join ' + s.joining.join(', ') + '.']),
        el('div', { class: 'sec-line', text: 'Section ' + s.to + ': ' + secText(s.target) }),
        s.clashes.length ? el('div', { class: 'bad-t', text: 'Clashes with ' + s.clashes.join(', ') + '.' }) : el('div', { class: 'ok', text: 'No time conflicts with the rest of their schedule.' })]);
      body.appendChild(card);
    });
  }

  function loadExample() {
    var ex = function (course, section, days, s, e, room) { return { course: course, section: section, nbr: '', days: days, start: L.parseTime(s), end: L.parseTime(e), room: room || '', instructor: '', alts: [] }; };
    state.friends = [
      L.cleanPerson({ name: 'Example: Sam', classes: [ex('MATH 2730', '001', [0, 2, 4], '12:20 PM', '1:10 PM', 'Lang 310'), ex('ENGL 1325', '008', [0, 2], '3:55 PM', '5:15 PM', 'Lang 314')] }),
      L.cleanPerson({ name: 'Example: Riya', classes: [ex('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM', 'Gab 112'), ex('CHEM 1420', '5', [1, 3], '9:35 AM', '10:55 AM', 'SAGE 230')] })];
    if (!state.me.classes.length) { state.me.name = state.me.name || 'You'; state.me.classes = [fromClean(ex('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM', 'Gab 112')), fromClean(ex('MEEN 1000', '002', [0, 2], '11:00 AM', '11:55 AM', 'NTDP E265'))]; $('my-name').value = state.me.name; renderEditor(); }
    save(); update();
  }

  /* ---- share + update ---- */
  var copyT = null;
  function update() {
    var me = toLogic(state.me);
    renderGrid($('my-grid'), [me]);
    var cf = L.conflicts(me.classes);
    $('my-warn').textContent = cf.length ? 'Overlap: ' + cf.map(function (p) { return (me.classes[p[0]].course || 'Class ' + (p[0] + 1)) + ' and ' + (me.classes[p[1]].course || 'Class ' + (p[1] + 1)); }).join('; ') + '.' : '';
    var base = location.href.split('#')[0];
    $('share-link').value = me.classes.length ? base + '#s=' + L.encodeShare(me) : '';
    renderCompare(); save();
  }
  function copyLink() {
    var inp = $('share-link'), msg = $('copy-msg');
    if (!inp.value) { msg.textContent = 'Add at least one class first.'; return; }
    function fallback() { inp.focus(); inp.select(); msg.textContent = 'Press Ctrl+C or Cmd+C to copy.'; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(inp.value).then(function () { msg.textContent = 'Copied.'; }, fallback); else fallback();
    clearTimeout(copyT); copyT = setTimeout(function () { msg.textContent = ''; }, 4000);
  }
  function addFriend(text, quiet) {
    var msg = $('friend-msg'), p = L.decodeShare(text);
    if (!p || !p.classes.length) { msg.className = 'msg err'; msg.textContent = 'That does not look like a share link. Copy the whole link your friend sent.'; return false; }
    if (state.friends.length >= 11) { msg.className = 'msg err'; msg.textContent = 'That is the most people this page compares at once.'; return false; }
    state.friends.push(p); msg.className = 'msg'; msg.textContent = quiet ? '' : 'Added ' + p.name + '.';
    $('friend-input').value = ''; update(); return true;
  }
  function showTab(t) {
    var me = t === 'me';
    $('panel-me').hidden = !me; $('panel-cmp').hidden = me;
    $('tab-me').setAttribute('aria-selected', me); $('tab-cmp').setAttribute('aria-selected', !me);
  }
  function checkIncoming() {
    if (!/[#&]s=/.test(location.hash)) return;
    var p = L.decodeShare(location.hash);
    var b = $('banner');
    if (!p) { return; }
    b.hidden = false; b.innerHTML = '';
    b.appendChild(el('span', { text: 'This link has ' + p.name + '\'s schedule (' + p.classes.length + ' ' + (p.classes.length === 1 ? 'class' : 'classes') + ').' }));
    b.appendChild(el('button', { type: 'button', class: 'btn primary small', text: 'Add to compare', onclick: function () { if (addFriend(location.hash, true)) { history.replaceState(null, '', location.pathname + location.search); b.hidden = true; showTab('cmp'); } } }));
    b.appendChild(el('button', { type: 'button', class: 'btn small', text: 'Dismiss', onclick: function () { history.replaceState(null, '', location.pathname + location.search); b.hidden = true; } }));
  }

  function init() {
    load();
    $('my-name').value = state.me.name;
    $('my-name').addEventListener('input', function () { state.me.name = $('my-name').value; update(); });
    $('add-class').addEventListener('click', function () { state.me.classes.push(blankClass()); renderEditor(); update(); var l = $('classes').querySelector('.class:last-child input'); if (l) l.focus(); });
    $('copy-link').addEventListener('click', copyLink);
    $('add-friend').addEventListener('click', function () { addFriend($('friend-input').value); });
    $('friend-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addFriend($('friend-input').value); });
    $('tab-me').addEventListener('click', function () { showTab('me'); });
    $('tab-cmp').addEventListener('click', function () { showTab('cmp'); });
    $('clear-all').addEventListener('click', function () { try { localStorage.removeItem(KEY); } catch (e) {} state = { me: { name: '', classes: [] }, friends: [] }; $('my-name').value = ''; renderEditor(); update(); });
    renderEditor(); update(); checkIncoming();
  }
  init();
})();
