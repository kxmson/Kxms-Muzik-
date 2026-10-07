const tracksBox = document.getElementById("tracks");
const audio = document.getElementById("audio");
const nowPlaying = document.getElementById("now");
const artistName = document.getElementById("artist");
const count = document.getElementById("count");

let tracks = [];

async function loadTracks() {
  try {
    const response = await fetch("/api/tracks");

    if (!response.ok) {
      throw new Error("Could not load music");
    }

    tracks = await response.json();

    count.textContent =
      `${tracks.length} release${tracks.length === 1 ? "" : "s"}`;

    if (tracks.length === 0) {
      tracksBox.innerHTML = `
        <div class="empty">
          Music is coming soon.
        </div>
      `;

      return;
    }

    tracksBox.innerHTML = tracks.map(track => `
      <article class="card">

        <div class="cover">

          ${
            track.artworkUrl
              ? `<img src="${track.artworkUrl}" alt="${escapeHtml(track.title)}">`
              : `<span>KXMS</span>`
          }

        </div>

        <h3>
          ${escapeHtml(track.title)}
        </h3>

        <p>
          ${escapeHtml(track.artist)}
        </p>

        <button
          onclick="playTrack('${track.id}')"
        >
          ▶ Play
        </button>

      </article>
    `).join("");

  } catch (error) {

    console.error(error);

    count.textContent = "";

    tracksBox.innerHTML = `
      <div class="empty">
        Unable to load music right now.
      </div>
    `;
  }
}


function playTrack(id) {

  const track = tracks.find(
    item => item.id === id
  );

  if (!track) {
    return;
  }

  audio.src = track.audioUrl;

  nowPlaying.textContent =
    track.title;

  artistName.textContent =
    track.artist;

  audio.play().catch(error => {
    console.log("Playback waiting for user interaction.");
  });

  fetch(
    `/api/tracks/${id}/play`,
    {
      method: "POST"
    }
  ).catch(error => {
    console.log("Play count error:", error);
  });
}


function escapeHtml(value) {

  return String(value || "").replace(
    /[&<>"']/g,

    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]
  );
}


loadTracks();
