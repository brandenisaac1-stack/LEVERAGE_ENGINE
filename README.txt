AKERMAN LEVERAGE EMBED — PROTOTYPE

What this proves
- Full leverage curve always remains visible.
- Selecting an iteration changes only the highlighted point and annotation.
- Labels/annotation can be independently shown or hidden.
- Tim's 01/17/29–11/30/29 optimal execution window is drawn independently of the data.
- A transaction schedule can live inside the same embedded visualization.
- No external JavaScript libraries are required.

GitHub Pages quick publish
1. Create a new GitHub repository.
2. Upload index.html from this folder to the repository root.
3. Repository Settings -> Pages.
4. Under Build and deployment, choose "Deploy from a branch".
5. Branch: main, folder: /(root), Save.
6. GitHub will give you an HTTPS Pages URL.
7. Paste that URL into ArcGIS Dashboard -> Embedded content -> Static -> Document -> URL.

Next integration step
- Replace the DATA constant embedded in index.html with a live query against the ArcGIS relograph Feature Service.
- Then pass the selected iteration to this page as a URL query parameter (for example ?iteration=09%2F18%2F26%20-%2010%2F10%2F26) while still querying/drawing the full relograph dataset.


V2 enhancement
- Added a "process overlay" toggle.
- Static process bars are drawn directly in the same date/leverage coordinate system as the curves.
- Bars use restrained translucent gradients so they read as architecture, not a second dominant chart.
- Process dates/labels live in the PROCESS configuration block and can be edited later without rewriting chart logic.
