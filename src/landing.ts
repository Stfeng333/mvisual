/**
 * Landing UI: futuristic black screen, "MVisual" title, search bar + upload.
 * Calls onSelect with either file or Spotify-style track info.
 */

export type SpotifyMeta = {
  bpm: number;
  energy: number;
  valence: number;
  genres: string[];
};

export type TrackSource =
  | { type: 'file'; file: File; name: string; meta?: SpotifyMeta }
  | {
      type: 'spotify';
      trackId: string;
      name: string;
      artist: string;
      previewUrl: string | null;
      bpm: number;
      energy: number;
      valence: number;
      genres: string[];
    };

export type OnSelect = (source: TrackSource) => void;

const searchIconSvg = `<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>`;

export function renderLanding(container: HTMLElement, onSelect: OnSelect): void {
  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  const title = document.createElement('h1');
  title.className = 'landing-title';
  title.textContent = 'MVisual';
  fragment.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'landing-subtitle';
  subtitle.textContent = 'Music visualizer';
  fragment.appendChild(subtitle);

  const deezerInfoRow = document.createElement('div');
  deezerInfoRow.className = 'spotify-auth-row';
  const infoLabel = document.createElement('span');
  infoLabel.className = 'spotify-auth-label';
  infoLabel.textContent = '30s previews via Deezer — no login required.';
  deezerInfoRow.appendChild(infoLabel);
  fragment.appendChild(deezerInfoRow);

  const controls = document.createElement('div');
  controls.className = 'landing-controls';

  const searchWrap = document.createElement('div');
  searchWrap.className = 'search-wrap';
  searchWrap.innerHTML = searchIconSvg;
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'search-input';
  searchInput.placeholder = 'Search for a song or upload below…';
  searchInput.setAttribute('aria-label', 'Search for a song');
  searchWrap.appendChild(searchInput);
  controls.appendChild(searchWrap);

  const resultsList = document.createElement('ul');
  resultsList.className = 'search-results';
  resultsList.hidden = true;
  controls.appendChild(resultsList);

  const uploadWrap = document.createElement('div');
  uploadWrap.className = 'upload-wrap';
  const uploadLabel = document.createElement('label');
  uploadLabel.className = 'upload-label';
  uploadLabel.htmlFor = 'mvisual-file';
  uploadLabel.textContent = 'Or upload your own file';
  const uploadInput = document.createElement('input');
  uploadInput.id = 'mvisual-file';
  uploadInput.type = 'file';
  uploadInput.className = 'upload-input';
  uploadInput.accept = 'audio/*';
  uploadLabel.appendChild(uploadInput);
  uploadWrap.appendChild(uploadLabel);
  controls.appendChild(uploadWrap);

  // Card shown when user picks a track with no preview: "Upload this song" to use Spotify BPM/energy
  const noPreviewCard = document.createElement('div');
  noPreviewCard.className = 'upload-no-preview-card';
  noPreviewCard.hidden = true;
  const noPreviewLabel = document.createElement('label');
  noPreviewLabel.className = 'upload-label';
  noPreviewLabel.htmlFor = 'mvisual-file-no-preview';
  noPreviewCard.appendChild(noPreviewLabel);
  const noPreviewInput = document.createElement('input');
  noPreviewInput.id = 'mvisual-file-no-preview';
  noPreviewInput.type = 'file';
  noPreviewInput.accept = 'audio/*';
  noPreviewInput.className = 'upload-input';
  noPreviewCard.appendChild(noPreviewInput);
  controls.appendChild(noPreviewCard);

  fragment.appendChild(controls);
  container.appendChild(fragment);

  let pendingNoPreviewMeta: { name: string; bpm: number; energy: number; valence: number; genres: string[] } | null = null;

  function hideNoPreviewCard() {
    noPreviewCard.hidden = true;
    pendingNoPreviewMeta = null;
    noPreviewInput.value = '';
  }

  // Search: optional API hook (no-op until backend is set)
  let searchDebounce: ReturnType<typeof setTimeout> | null = null;
  searchInput.addEventListener('input', () => {
    hideNoPreviewCard();
    if (searchDebounce) clearTimeout(searchDebounce);
    const q = searchInput.value.trim();
    if (!q) {
      resultsList.hidden = true;
      resultsList.innerHTML = '';
      return;
    }
    searchDebounce = setTimeout(() => {
      searchDebounce = null;
      doSearch(q, resultsList, searchInput, onSelect, {
        noPreviewCard,
        noPreviewLabel,
        hideNoPreviewCard,
        setPendingNoPreviewMeta: (m) => {
          pendingNoPreviewMeta = m;
        },
      });
    }, 300);
  });

  searchInput.addEventListener('focus', () => {
    if (resultsList.children.length > 0) resultsList.hidden = false;
  });

  document.addEventListener('click', (e) => {
    if (!controls.contains(e.target as Node)) {
      resultsList.hidden = true;
      hideNoPreviewCard();
    }
  });

  // File upload (general)
  uploadInput.addEventListener('change', () => {
    const file = uploadInput.files?.[0];
    if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    hideNoPreviewCard();
    onSelect({ type: 'file', file, name });
  });

  // File upload for "no preview" track (use Spotify metadata with uploaded file)
  noPreviewInput.addEventListener('change', () => {
    const file = noPreviewInput.files?.[0];
    if (!file || !pendingNoPreviewMeta) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    onSelect({
      type: 'file',
      file,
      name,
      meta: {
        bpm: pendingNoPreviewMeta.bpm,
        energy: pendingNoPreviewMeta.energy,
        valence: pendingNoPreviewMeta.valence,
        genres: pendingNoPreviewMeta.genres,
      },
    });
    hideNoPreviewCard();
  });
}

type NoPreviewContext = {
  noPreviewCard: HTMLElement;
  noPreviewLabel: HTMLElement;
  hideNoPreviewCard: () => void;
  setPendingNoPreviewMeta: (m: { name: string; bpm: number; energy: number; valence: number; genres: string[] } | null) => void;
};

async function doSearch(
  q: string,
  resultsList: HTMLUListElement,
  searchInput: HTMLInputElement,
  onSelect: OnSelect,
  noPreviewCtx: NoPreviewContext
): Promise<void> {
  const api = (window as Window & { __MVISUAL_SPOTIFY_API__?: string }).__MVISUAL_SPOTIFY_API__;
  if (!api) {
    resultsList.innerHTML = '<li class="track-meta" style="padding:1rem;cursor:default">Search backend not configured. Use "Upload your own file" for now.</li>';
    resultsList.hidden = false;
    return;
  }
  try {
    const res = await fetch(`${api}/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('Search failed');
    const data = (await res.json()) as { tracks?: Array<{ id: string; name: string; artist: string; previewUrl: string | null; bpm: number; energy: number; valence: number; genres: string[] }> };
    const tracks = data.tracks ?? [];
    resultsList.innerHTML = '';
    if (tracks.length === 0) {
      resultsList.innerHTML = '<li class="track-meta" style="padding:1rem;cursor:default">No results. Try uploading your own file.</li>';
    } else {
      for (const t of tracks) {
        const li = document.createElement('li');
        const trackNoPreview = !t.previewUrl;
        if (trackNoPreview) li.classList.add('track-no-preview');
        li.innerHTML = `<span class="track-name">${escapeHtml(t.name)}</span> <span class="track-meta">${escapeHtml(t.artist)}</span>${trackNoPreview ? ' <span class="track-no-preview-tag">No preview</span>' : ''}`;
        li.addEventListener('click', () => {
          const meta = {
            bpm: t.bpm ?? 120,
            energy: t.energy ?? 0.5,
            valence: t.valence ?? 0.5,
            genres: t.genres ?? [],
          };
          if (trackNoPreview) {
            noPreviewCtx.setPendingNoPreviewMeta({ name: t.name, ...meta });
            noPreviewCtx.noPreviewLabel.innerHTML = `Upload "<strong>${escapeHtml(t.name)}</strong>" to visualize with this track's BPM & energy`;
            noPreviewCtx.noPreviewCard.hidden = false;
            resultsList.hidden = true;
            searchInput.value = '';
            return;
          }
          onSelect({
            type: 'spotify',
            trackId: t.id,
            name: t.name,
            artist: t.artist,
            previewUrl: t.previewUrl ?? null,
            bpm: meta.bpm,
            energy: meta.energy,
            valence: meta.valence,
            genres: meta.genres,
          });
          noPreviewCtx.hideNoPreviewCard();
          resultsList.hidden = true;
          searchInput.value = '';
        });
        resultsList.appendChild(li);
      }
    }
    resultsList.hidden = false;
  } catch (err) {
    console.error('Search error:', err);
    resultsList.innerHTML =
      '<li class="track-meta" style="padding:1rem;cursor:default">Search unavailable. Make sure the backend is running (<code>npm run server</code>), then try again. Or use "Upload your own file".</li>';
    resultsList.hidden = false;
  }
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}
