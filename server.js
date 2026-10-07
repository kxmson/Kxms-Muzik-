const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";

const DATA_DIR = path.join(__dirname, "data");
const MUSIC_DIR = path.join(__dirname, "uploads", "music");
const ARTWORK_DIR = path.join(__dirname, "uploads", "artwork");

for (const dir of [DATA_DIR, MUSIC_DIR, ARTWORK_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const DATA_FILE = path.join(DATA_DIR, "tracks.json");

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, "[]");
}

function getTracks() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}

function saveTracks(tracks) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tracks, null, 2));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "audio") {
      cb(null, MUSIC_DIR);
    } else {
      cb(null, ARTWORK_DIR);
    }
  },

  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({ storage });

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({
      error: "Unauthorized"
    });
  }

  next();
}

app.get("/api/tracks", (req, res) => {
  const tracks = getTracks().filter(track => track.published);
  res.json(tracks);
});

app.post(
  "/api/admin/upload",
  adminAuth,
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "artwork", maxCount: 1 }
  ]),
  (req, res) => {

    if (!req.files?.audio?.[0]) {
      return res.status(400).json({
        error: "Audio file is required"
      });
    }

    const track = {
      id: Date.now().toString(),
      title: req.body.title || "Untitled",
      artist: req.body.artist || "KXMS",
      genre: req.body.genre || "Afrobeats",
      releaseDate: req.body.releaseDate || "",
      description: req.body.description || "",

      audioUrl:
        `/uploads/music/${req.files.audio[0].filename}`,

      artworkUrl:
        req.files.artwork?.[0]
          ? `/uploads/artwork/${req.files.artwork[0].filename}`
          : "",

      published: true,
      plays: 0,
      createdAt: new Date().toISOString()
    };

    const tracks = getTracks();

    tracks.unshift(track);

    saveTracks(tracks);

    res.json(track);
  }
);

app.post("/api/tracks/:id/play", (req, res) => {
  const tracks = getTracks();

  const track = tracks.find(
    item => item.id === req.params.id
  );

  if (!track) {
    return res.status(404).json({
      error: "Track not found"
    });
  }

  track.plays = (track.plays || 0) + 1;

  saveTracks(tracks);

  res.json({
    plays: track.plays
  });
});

app.get("/api/admin/tracks", adminAuth, (req, res) => {
  res.json(getTracks());
});

app.delete("/api/admin/tracks/:id", adminAuth, (req, res) => {
  const tracks = getTracks();

  const track = tracks.find(
    item => item.id === req.params.id
  );

  if (!track) {
    return res.status(404).json({
      error: "Track not found"
    });
  }

  saveTracks(
    tracks.filter(item => item.id !== req.params.id)
  );

  res.json({
    success: true
  });
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

app.listen(PORT, () => {
  console.log(`KXMS Music running on port ${PORT}`);
});
