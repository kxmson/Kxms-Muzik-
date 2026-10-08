const tracksBox = document.getElementById("tracks");
const audio = document.getElementById("audio");
const count = document.getElementById("count");

const playerTitle =
  document.getElementById("playerTitle");

const playerArtist =
  document.getElementById("playerArtist");

const featured =
  document.getElementById("featured");

let tracks = [];


async function loadTracks() {

  try {

    const response =
      await fetch("/api/tracks");

    if (!response.ok) {
      throw new Error("Could not load music");
    }

    tracks =
      await response.json();
    const releasedTracks =
  tracks.filter(
    track =>
      track.status !== "coming-soon"
  );

const comingSoonTracks =
  tracks.filter(
    track =>
      track.status === "coming-soon"
  );


    count.textContent =
      `${tracks.length} release${tracks.length === 1 ? "" : "s"}`;


    if (tracks.length === 0) {

      featured.innerHTML = `
        <div class="featured-cover">
          <span>KXMS</span>
        </div>

        <div class="featured-info">

          <p class="eyebrow">
            COMING SOON
          </p>

          <h2>
            New Music
          </h2>

          <p>
            KXMS releases will appear here.
          </p>

        </div>
      `;


      tracksBox.innerHTML = `
        <div class="empty">
          Music is coming soon.
        </div>
      `;

      return;
    }


    setupFeaturedTrack(tracks[0]);

    renderTracks();

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


function setupFeaturedTrack(track) {

  const artwork =
    track.artworkUrl
      ? `
        <img
          src="${track.artworkUrl}"
          alt="${escapeHtml(track.title)}"
        >
      `
      : `
        <span>KXMS</span>
      `;


  featured.innerHTML = `

    <div class="featured-cover">
      ${artwork}
    </div>

    <div class="featured-info">

      <p class="eyebrow">
        LATEST RELEASE
      </p>

      <h2>
        ${escapeHtml(track.title)}
      </h2>

      <p>
        ${escapeHtml(track.artist)}
        ${track.genre ? " · " + escapeHtml(track.genre) : ""}
      </p>

      <button
        class="play-main"
        onclick="playTrack('${track.id}')"
      >
        ▶ PLAY
      </button>

    </div>

  `;

}


function renderTracks() {

  tracksBox.innerHTML =
    tracks.map(track => {

      const artwork =
        track.artworkUrl
          ? `
            <img
              src="${track.artworkUrl}"
              alt="${escapeHtml(track.title)}"
            >
          `
          : `
            <span>KXMS</span>
          `;


      return `

        <article class="card">

          <div class="cover">
            ${artwork}
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

      `;

    }).join("");

}


function playTrack(id) {

  const track =
    tracks.find(
      item => item.id === id
    );


  if (!track) {
    return;
  }


  audio.src =
    track.audioUrl;


  playerTitle.textContent =
    track.title;


  playerArtist.textContent =
    track.artist;


  audio.play().catch(() => {

    console.log(
      "Playback waiting for user interaction."
    );

  });


  fetch(
    `/api/tracks/${id}/play`,
    {
      method: "POST"
    }
  ).catch(error => {

    console.log(
      "Play count error:",
      error
    );

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
