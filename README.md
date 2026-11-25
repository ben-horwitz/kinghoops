# KING Hoops — website

Custom HTML/CSS/JS rebuild of [kinghoops.org](https://www.kinghoops.org), migrated off Wix.
No build step, no framework, no dependencies: every page is a plain `.html` file.

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home |
| `about.html` | About Us (Story, History, Impact, Team, Get Involved) |
| `programs.html` | Programs (AAU, Fall Academy, Clinics, Tournament Schedule) |
| `events.html` | Events (Shoot-A-Thon, March Madness Watch Party) |
| `alumni.html` | Alumni |
| `media.html` | Media (Announcements, On Screen videos, Gallery, Blog) |
| `tryouts.html` | Tryouts |
| `contact.html` | Contact + FAQs |
| `donate.html` | Donate (Zeffy donation form) |

Shared files:

- `assets/css/style.css`: all styling. Brand colors are CSS variables at the top (`--navy`, `--gold`, `--blue`).
- `assets/js/main.js`: mobile menu, scroll animations, photo/video lightbox, alumni filter, count-up stats, contact form.
- `assets/img/`: all photos, downloaded from the Wix site (file names are the original Wix media IDs).
- `assets/video/`: hero and "On Screen" videos with poster images.

## The 3D home page

The home page opens with a scroll-driven 3D story: a jump shot (with the mission and impact stats), then a drive and dunk over a defender (with the programs and history). Everything is built in code with [three.js](https://threejs.org) loaded from a CDN; there are no 3D model files.

- `assets/js/court3d.js`: the scene, the jointed players, and the timeline. Every frame is a function of scroll progress `p` (0 to 1).
  - Poses are keyframes such as `SET`, `RELEASE` or `SLAM`, tracked in `KEYS1` / `KEYS2` / `KEYSD`.
  - Camera moves are in `CAM`.
  - Scores happen at `SCORE1` / `SCORE2`.
- `assets/css/home3d.css`: layout for the story text, scoreboard and progress rail.
- **Text:** each block in `index.html` has `data-p="start,end"`, which sets when it shows during the scroll.
- **Fallback:** without WebGL, the same text shows as a plain stacked section.
- **Classic version:** the pre-3D site is saved on the `classic` branch (tag `v1-classic`).

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Editing

- **Text:** edit the page's `.html` file directly.
- **Header/footer/nav:** these are repeated in every page. If you change a menu item, change it in all 9 files (find-and-replace works well).
- **Tryout registration link:** search for `leagueapps.com` (it appears on the Home and Tryouts pages).
- **Add an alumnus:** copy one `<article class="alum" ...>` block in `alumni.html`, change the name, class year (`data-class` too), school and the two photos.

## Things to know

- **Contact form:** static sites can't send email on their own, so the form opens the visitor's email app with the message addressed to Josh@kinghoops.org. To receive submissions directly instead, sign up for a form service (e.g. Formspree or Netlify Forms) and point the form's `action` at it.
- **Donations:** the Donate page embeds the existing Zeffy form, so donations keep flowing to the same account.

## Deploying with GitHub Pages

1. Repo **Settings → Pages** → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`.
2. To use `www.kinghoops.org`: under **Custom domain**, enter `www.kinghoops.org` (GitHub adds a `CNAME` file).
3. At the domain registrar (currently pointed at Wix), set:
   - `www` → CNAME → `<your-github-username>.github.io`
   - apex `kinghoops.org` → A records `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
4. Once DNS is live, tick **Enforce HTTPS**. Keep the Wix site up until the new one is confirmed working.
