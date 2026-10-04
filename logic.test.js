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

const typical = () => ({ name: 'Aneesh', classes: [
  cls('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM', { nbr: '6571', room: 'Gab 112' }),
  cls('MEEN 1000', '002', [0, 2], '11:00 AM', '11:55 AM', { nbr: '12110', room: 'NTDP E265', instructor: 'Manzo' }),
  cls('MATH 3410', '005', [0, 2], '2:25 PM', '3:45 PM', { nbr: '11799', room: 'SAGE 354', instructor: 'He' }),
  cls('ENGL 1325', '008', [0, 2], '3:55 PM', '5:15 PM', { nbr: '5952', room: 'Lang 314', instructor: 'Steele' }),
  cls('CHEM 1420', '005', [1, 3], '9:35 AM', '10:55 AM', { nbr: '6909', room: 'SAGE 230', instructor: 'Liu' }),
  cls('CHEM 1420 disc', '205', [1], '2:30 PM', '3:20 PM', { nbr: '6910', room: 'Phys 104', instructor: 'Liu' }),
  cls('CHEM 1440 lab', '313', [1], '3:55 PM', '6:45 PM', { nbr: '11021', room: 'CHEM 131', instructor: 'Stephens' }),
  cls('MATH 2700', '009', [1, 3], '12:45 PM', '2:05 PM', { nbr: '10011', room: 'SAGE 355', instructor: 'Elwood' })] });

test('share link round trip keeps days, times, sections and alternates', async () => {
  const p = { name: 'Aneesh', classes: [cls('MATH 2730', '003', [0, 2, 4], '9:05 AM', '9:55 AM', { room: 'Gab 112', alts: [cls('MATH 2730', '001', [0, 2, 4], '12:20 PM', '1:10 PM', { room: 'Lang 310' })] })] };
  const code = await L.encodeShare(p);
  assert.match(code, /^z[A-Za-z0-9_-]+$/);
  const back = await L.decodeShare('https://x.github.io/schedule-compare/#s=' + code);
  assert.strictEqual(back.name, 'Aneesh');
  assert.deepStrictEqual(back.classes[0].days, [0, 2, 4]);
  assert.strictEqual(back.classes[0].start, 9 * 60 + 5);
  assert.strictEqual(back.classes[0].room, 'Gab 112');
  assert.strictEqual(back.classes[0].alts[0].section, '001');
  assert.strictEqual(back.classes[0].alts[0].course, 'MATH 2730');
  assert.deepStrictEqual(await L.decodeShare(code), back);
  assert.deepStrictEqual(await L.decodeShare('#s=' + code), back);
});

test('extras option adds class numbers and instructors, default leaves them out', async () => {
  const lean = await L.decodeShare(await L.encodeShare(typical()));
  assert.strictEqual(lean.classes[1].nbr, '');
  assert.strictEqual(lean.classes[1].instructor, '');
  assert.strictEqual(lean.classes[1].room, 'NTDP E265');
  const full = await L.decodeShare(await L.encodeShare(typical(), { extras: true }));
  assert.strictEqual(full.classes[1].nbr, '12110');
  assert.strictEqual(full.classes[1].instructor, 'Manzo');
});

test('links are much shorter than the old format', async () => {
  const p = typical();
  const lean = await L.encodeShare(p), full = await L.encodeShare(p, { extras: true });
  const v1 = Buffer.from(JSON.stringify({ v: 1, p })).toString('base64url');
  assert.ok(lean.length < 330, 'lean was ' + lean.length);
  assert.ok(full.length < 420, 'full was ' + full.length);
  assert.ok(lean.length < v1.length / 3);
});

test('old v1 links still decode', async () => {
  const p = { name: 'Old', classes: [cls('MATH 2730', '001', [0, 2, 4], '12:20 PM', '1:10 PM', { room: 'Lang 310' })] };
  const v1 = Buffer.from(JSON.stringify({ v: 1, p })).toString('base64url');
  const back = await L.decodeShare('#s=' + v1);
  assert.strictEqual(back.name, 'Old');
  assert.strictEqual(back.classes[0].start, 740);
});

test('bad input decodes to null', async () => {
  assert.strictEqual(await L.decodeShare('not a link!'), null);
  assert.strictEqual(await L.decodeShare('#s=AAAA'), null);
  assert.strictEqual(await L.decodeShare('#s=zAAAA'), null);
  assert.strictEqual(await L.decodeShare(''), null);
});

test('decode clamps hostile input, including a compression bomb', async () => {
  const evil = Buffer.from(JSON.stringify({ v: 1, p: { name: '<img src=x onerror=1>'.repeat(10), classes: Array(100).fill({ course: 'X', section: '1', days: [9, -1, 'a', 2, 2], start: '99:99', end: 600 }) } })).toString('base64url');
  const p = await L.decodeShare(evil);
  assert.ok(p.name.length <= 40);
  assert.strictEqual(p.classes.length, 20);
  assert.deepStrictEqual(p.classes[0].days, [2]);
  assert.strictEqual(p.classes[0].start, null);
  const bomb = 'z' + require('zlib').deflateRawSync(Buffer.alloc(5e6, 32), { level: 9 }).toString('base64url');
  assert.strictEqual(await L.decodeShare(bomb), null);
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
