# Schedule Compare

A small static page for comparing class schedules with friends. Type in your classes (course, section, days, times, room), copy your share link, and paste friends' links into the Compare tab.

The Compare tab shows:

- everyone on one weekly grid, one color per person
- the courses you share, and whether you are in the same section
- suggested section swaps that would put you in the same section as a friend, checked against the rest of your schedule

No timetable is built in. You enter section numbers and times yourself. Add other sections of a course under a class to widen the swap suggestions.

## Share links

Links use a compact, compressed format (about 300 characters for a full schedule). "Copy code only" gives just the code, and the Compare tab accepts a pasted link or a bare code. Links from the first version of the page still work. A server-free page cannot go much shorter than this, so if you want a tiny link, paste it into a URL shortener.

## Privacy

There is no server, no account and no analytics. Your schedule is saved in your browser and, when you share, encoded inside the link itself. Anyone with the link can read the schedule, so only send it to people you trust.

## Run it

Open `index.html`, or serve the folder:

```bash
python3 -m http.server 8000
```

## Test

```bash
node --test
```

## Files

- `logic.js`: time parsing, overlap checks, share-link encode and decode, shared classes, swap suggestions (no DOM, tested in Node)
- `app.js`: page wiring
- `index.html`, `style.css`: page and styles
