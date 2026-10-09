
const express = require("express");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand
} = require("@aws-sdk/client-s3");

const path = require("path");

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "change-this-password";

const requiredEnv = [
  "R2_ACCOUNT_ID",
  "R2_BUCKET_NAME",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY"
];

const missingEnv = requiredEnv.filter(name => !process.env[name]);

if (missingEnv.length) {
  console.error("Missing required environment variables:", missingEnv.join(", "));
  process.exit(1);
}

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.R2_BUCKET_NAME;
const TRACKS_KEY = "data/tracks.json";

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 250 * 1024 * 1024,
    files: 2
  }
});

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (auth !== `Bearer ${ADMIN_PASSWORD}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

async function getTracks() {
  try {
    const result = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: TRACKS_KEY
      })
    );

    const text = await result.Body.transformToString();
    return JSON.parse(text);
  } catch (error) {
    if (
      error.name === "NoSuchKey" ||
      error.Code === "NoSuchKey" ||
      error.$metadata?.httpStatusCode === 404
    ) {
      return [];
    }

    throw error;
  }
}

async function saveTracks(tracks) {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: TRACKS_KEY,
      Body: JSON.stringify(tracks, null, 2),
      ContentType: "application/json"
    })
  );
}

async function storeFile(file, folder) {
  const safeName = path
    .basename(file.originalname)
    .replace(/[^a-zA-Z0-9._-]/g, "_");

  const key = `${folder}/${Date.now()}-${safeName}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream"
    })
  );

  return key;
}

function mediaUrl(key) {
  if (!key) return "";
  const parts = key.split("/");
  return `/media/${parts.map(encodeURIComponent).join("/")}`;
}

async function deleteFile(key) {
  if (!key) return;

  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key
    })
  );
}

app.get("/api/tracks", async (req, res) => {
  try {
    const tracks = await getTracks();
    res.json(tracks.filter(track => track.published));
  } catch (error) {
    console.error("Could not load tracks:", error);
    res.status(500).json({ error: "Could not load music" });
  }
});

// Stream private R2 files through the website.
// Supports HTTP Range requests so listeners can seek within tracks.
app.get("/media/:type/:filename", async (req, res) => {
  const { type, filename } = req.params;

  if (!["music", "artwork"].includes(type)) {
    return res.status(404).send("File not found");
  }

  const key = `${type}/${filename}`;

  try {
    const range = req.headers.range;
    const params = {
      Bucket: BUCKET,
      Key: key
    };

    if (range && /^bytes=\d*-\d*$/.test(range)) {
      params.Range = range;
    }

    const result = await s3.send(new GetObjectCommand(params));

    res.setHeader(
      "Content-Type",
      result.ContentType || "application/octet-stream"
    );
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "public, max-age=3600");

    if (result.ContentLength !== undefined) {
      res.setHeader("Content-Length", result.ContentLength);
    }

    if (result.ContentRange) {
      res.status(206);
      res.setHeader("Content-Range", result.ContentRange);
    }

    result.Body.pipe(res);
  } catch (error) {
    if (error.$metadata?.httpStatusCode === 404 || error.name === "NoSuchKey") {
      return res.status(404).send("File not found");
    }

    console.error("R2 media error:", error);
    if (!res.headersSent) {
      res.status(500).send("Unable to load media");
    } else {
      res.end();
    }
  }
});

app.post(
  "/api/admin/upload",
  adminAuth,
  upload.fields([
    { name: "audio", maxCount: 1 },
    { name: "artwork", maxCount: 1 }
  ]),
  async (req, res) => {
    let audioKey = "";
    let artworkKey = "";

    try {
      const audioFile = req.files?.audio?.[0];
      const artworkFile = req.files?.artwork?.[0];

      if (!audioFile) {
        return res.status(400).json({ error: "Audio file is required" });
      }

      audioKey = await storeFile(audioFile, "music");

      if (artworkFile) {
        artworkKey = await storeFile(artworkFile, "artwork");
      }

      const track = {
        id: Date.now().toString(),
        title: req.body.title || "Untitled",
        artist: req.body.artist || "KXMS",
        genre: req.body.genre || "Afrobeats",
        status:
          req.body.status === "coming-soon" ? "coming-soon" : "released",
        description: req.body.description || "",
        audioKey,
        artworkKey,
        audioUrl: mediaUrl(audioKey),
        artworkUrl: mediaUrl(artworkKey),
        published: true,
        plays: 0,
        createdAt: new Date().toISOString()
      };

      const tracks = await getTracks();
      tracks.unshift(track);
      await saveTracks(tracks);

      res.json(track);
    } catch (error) {
      console.error("Upload failed:", error);

      // Remove partially uploaded files if the catalogue save fails.
      try {
        await deleteFile(audioKey);
        await deleteFile(artworkKey);
      } catch (cleanupError) {
        console.error("Upload cleanup failed:", cleanupError);
      }

      res.status(500).json({ error: "Upload failed. Please try again." });
    }
  }
);

app.post("/api/tracks/:id/play", async (req, res) => {
  try {
    const tracks = await getTracks();
    const track = tracks.find(item => item.id === req.params.id);

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    track.plays = (track.plays || 0) + 1;
    await saveTracks(tracks);

    res.json({ plays: track.plays });
  } catch (error) {
    console.error("Could not update play count:", error);
    res.status(500).json({ error: "Could not update play count" });
  }
});

app.get("/api/admin/tracks", adminAuth, async (req, res) => {
  try {
    res.json(await getTracks());
  } catch (error) {
    console.error("Could not load admin tracks:", error);
    res.status(500).json({ error: "Could not load tracks" });
  }
});

app.patch("/api/admin/tracks/:id/status", adminAuth, async (req, res) => {
  try {
    const tracks = await getTracks();
    const track = tracks.find(item => item.id === req.params.id);

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    const status = req.body.status;

    if (status !== "released" && status !== "coming-soon") {
      return res.status(400).json({ error: "Invalid release status" });
    }

    track.status = status;
    await saveTracks(tracks);

    res.json(track);
  } catch (error) {
    console.error("Could not update track status:", error);
    res.status(500).json({ error: "Could not update track status" });
  }
});

app.delete("/api/admin/tracks/:id", adminAuth, async (req, res) => {
  try {
    const tracks = await getTracks();
    const track = tracks.find(item => item.id === req.params.id);

    if (!track) {
      return res.status(404).json({ error: "Track not found" });
    }

    await saveTracks(tracks.filter(item => item.id !== req.params.id));

    await Promise.all([
      deleteFile(track.audioKey),
      deleteFile(track.artworkKey)
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Could not delete track:", error);
    res.status(500).json({ error: "Could not delete track" });
  }
});

app.get("/*splat", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`KXMS Music running on port ${PORT}`);
});
