const test = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');

const cls = (course, section, days, s, e, extra = {}) => Object.assign({ course, section, nbr: '', days, start: L.parseTime(s), end: L.parseTime(e), room: '', instructor: '', alts: [] }, extra);

test('parseTime handles common formats', () => {
  assert.strictEqual(L.parseTime('12:20 PM'), 12 * 60 + 20);
  assert.strictEqual(L.parseTime('9:05am'), 9 * 60 + 5);
  assert.strictEqual(L.parseTime('12:00 AM'), 0);
  assert.strictEqual(L.parseTime('14:20'), 14 * 60 + 20);
  assert.strictEqual(L.parseTime('9:05'), 9 * 60 + 5);   // bare 7 to 11 is AM
  assert.strictEqual(L.parseTime('2:25'), 14 * 60 + 25); // bare 1 to 6 is PM
  assert.strictEqual(L.parseTime('12:30'), 12 * 60 + 30);
  assert.strictEqual(L.parseTime('25:00'), null);
  assert.strictEqual(L.parseTime('banana'), null);
  assert.strictEqual(L.parseTime('13:75'), null);
});

test('back-to-back classes do not overlap, real overlaps do', () => {
  const a = cls('A', '1', [0, 2], '9:05 AM', '9:55 AM');
  const b = cls('B', '1', [0], '9:55 AM', '10:45 AM');
  const c = cls('C', '1', [0], '9:30 AM', '10:30 AM');
  const d = cls('D', '1', [1], '9:30 AM', '10:30 AM');
  assert.strictEqual(L.classesOverlap(a, b), false);
  assert.strictEqual(L.classesOverlap(a, c), true);
  assert.strictEqual(L.classesOverlap(a, d), false); // different day
  assert.deepStrictEqual(L.conflicts([a, b, c]), [[0, 2], [1, 2]]);
});

test('classes with no time never conflict', () => {
  const online = cls('PSCI 2305', '450', [], '', '');
  const a = cls('A', '1', [0], '9:00 AM', '10:00 AM');
  assert.strictEqual(L.classesOverlap(online, a), false);
});

test('share link round trip and sanitising', () => {
  const p = { name: 'Aneesh', classes: [cls('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM', { room: 'Gab 112', alts: [cls('MATH 2730', '001', [0, 2, 4], '12:20 PM', '1:10 PM')] })] };
  const code = L.encodeShare(p);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const back = L.decodeShare('https://x.github.io/schedule-compare/#s=' + code);
  assert.strictEqual(back.name, 'Aneesh');
  assert.strictEqual(back.classes[0].alts[0].section, '001');
  assert.deepStrictEqual(L.decodeShare(code), back);
  assert.strictEqual(L.decodeShare('not a link!'), null);
  assert.strictEqual(L.decodeShare('#s=AAAA'), null);
});

test('decode clamps hostile input', () => {
  const evil = Buffer.from(JSON.stringify({ v: 1, p: { name: '<img src=x onerror=1>'.repeat(10), classes: Array(100).fill({ course: 'X', section: '1', days: [9, -1, 'a', 2, 2], start: '99:99', end: 600 }) } })).toString('base64url');
  const p = L.decodeShare(evil);
  assert.ok(p.name.length <= 40);
  assert.strictEqual(p.classes.length, 20);
  assert.deepStrictEqual(p.classes[0].days, [2]);
  assert.strictEqual(p.classes[0].start, null);
});

test('sharedClasses groups by course and flags same vs different section', () => {
  const me = { name: 'Me', classes: [cls('MATH 2730', '003', [0], '9:05 AM', '9:55 AM'), cls('ENGL 1325', '008', [1], '10:00 AM', '11:00 AM')] };
  const sam = { name: 'Sam', classes: [cls('math2730', '001', [0], '12:20 PM', '1:10 PM'), cls('ENGL 1325', '008', [1], '10:00 AM', '11:00 AM')] };
  const g = L.sharedClasses([me, sam]);
  assert.strictEqual(g.length, 2);
  const eng = g.find(x => x.key === 'ENGL1325'), math = g.find(x => x.key === 'MATH2730');
  assert.strictEqual(eng.sameSection, true);
  assert.strictEqual(math.sameSection, false);
  assert.deepStrictEqual(math.bySection, { '003': ['Me'], '001': ['Sam'] });
});

test('suggestion offered when the switch is conflict free', () => {
  const me = { name: 'Me', classes: [cls('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM'), cls('CHEM 1420', '5', [1, 3], '9:35 AM', '10:55 AM')] };
  const sam = { name: 'Sam', classes: [cls('MATH 2730', '001', [0, 2, 4], '12:20 PM', '1:10 PM')] };
  const s = L.suggestions([me, sam]);
  const mine = s.find(x => x.person === 'Me');
  assert.strictEqual(mine.to, '001');
  assert.deepStrictEqual(mine.clashes, []);
  assert.deepStrictEqual(mine.joining, ['Sam']);
});

test('suggestion flags a conflicting switch and prefers a clean one', () => {
  const me = { name: 'Me', classes: [cls('MATH 2730', '003', [0], '9:05 AM', '9:55 AM'), cls('MEEN 1000', '2', [0], '12:30 PM', '1:30 PM')] };
  const sam = { name: 'Sam', classes: [cls('MATH 2730', '001', [0], '12:20 PM', '1:10 PM')] };
  const lee = { name: 'Lee', classes: [cls('MATH 2730', '002', [0], '2:00 PM', '2:50 PM')] };
  const s = L.suggestions([me, sam, lee]).find(x => x.person === 'Me');
  assert.strictEqual(s.to, '002');   // 001 clashes with MEEN 1000, 002 does not
  assert.deepStrictEqual(s.clashes, []);
  const onlySam = L.suggestions([me, sam]).find(x => x.person === 'Me');
  assert.strictEqual(onlySam.to, '001');
  assert.deepStrictEqual(onlySam.clashes, ['MEEN 1000 2']);
});

test('alternate sections can be targets and no suggestion when sections already match', () => {
  const me = { name: 'Me', classes: [cls('X 1', 'A', [0], '9:00 AM', '10:00 AM')] };
  const sam = { name: 'Sam', classes: [cls('X 1', 'A', [0], '9:00 AM', '10:00 AM')] };
  assert.deepStrictEqual(L.suggestions([me, sam]), []);
});
