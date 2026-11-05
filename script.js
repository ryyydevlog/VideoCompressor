const { FFmpeg } = FFmpegWASM;
const { fetchFile, toBlobURL } = FFmpegUtil;

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const compressBtn = document.getElementById("compressBtn");
const statusEl = document.getElementById("status");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const result = document.getElementById("result");
const resultText = document.getElementById("resultText");
const downloadLink = document.getElementById("downloadLink");

let selectedFile = null;
let ffmpeg = null;

function formatSize(bytes) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1
    ? `${mb.toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function selectFile(file) {
  if (!file) return;

  const isMp4 =
    file.type === "video/mp4" ||
    file.name.toLowerCase().endsWith(".mp4");

  if (!isMp4) {
    setStatus("Please choose an MP4 file.");
    return;
  }

  selectedFile = file;
  compressBtn.disabled = false;
  result.style.display = "none";
  setStatus(`Selected: ${file.name} (${formatSize(file.size)})`);
}

dropzone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  selectFile(fileInput.files[0]);
});

dropzone.addEventListener("dragover", event => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", event => {
  event.preventDefault();
  dropzone.classList.remove("dragover");
  selectFile(event.dataTransfer.files[0]);
});

async function loadFFmpeg() {
  if (ffmpeg) return ffmpeg;

  setStatus("Loading compression engine…");
  ffmpeg = new FFmpeg();

  ffmpeg.on("progress", ({ progress }) => {
    const percent = Math.max(0, Math.min(100, Math.round(progress * 100)));
    progressBar.style.width = `${percent}%`;
    setStatus(`Compressing… ${percent}%`);
  });

  const baseURL =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";

  await ffmpeg.load({
    coreURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.js`,
      "text/javascript"
    ),
    wasmURL: await toBlobURL(
      `${baseURL}/ffmpeg-core.wasm`,
      "application/wasm"
    )
  });

  return ffmpeg;
}

compressBtn.addEventListener("click", async () => {
  if (!selectedFile) return;

  try {
    compressBtn.disabled = true;
    progressWrap.classList.remove("hidden");
    progressBar.style.width = "0%";
    result.style.display = "none";

    const instance = await loadFFmpeg();

    const crf = document.getElementById("quality").value;
    const scale = document.getElementById("scale").value;
    const audio = document.getElementById("audio").value;

    const inputName = "input.mp4";
    const outputName = "compressed.mp4";

    setStatus("Reading video…");
    await instance.writeFile(
      inputName,
      await fetchFile(selectedFile)
    );

    const args = [
      "-i", inputName,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", crf,
      "-movflags", "+faststart"
    ];

    if (scale !== "none") {
      args.push("-vf", `scale=${scale}`);
    }

    if (audio === "none") {
      args.push("-an");
    } else {
      args.push("-c:a", "aac", "-b:a", audio);
    }

    args.push(outputName);

    setStatus("Starting compression…");
    await instance.exec(args);

    const data = await instance.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    const url = URL.createObjectURL(blob);

    downloadLink.href = url;
    downloadLink.download = `compressed-${selectedFile.name}`;

    const saved = selectedFile.size - blob.size;
    const percentSaved =
      selectedFile.size > 0
        ? Math.round((saved / selectedFile.size) * 100)
        : 0;

    resultText.textContent =
      `Done: ${formatSize(selectedFile.size)} → ${formatSize(blob.size)} ` +
      `(${percentSaved >= 0 ? `${percentSaved}% smaller` : `${Math.abs(percentSaved)}% larger`}).`;

    result.style.display = "block";
    setStatus("Compression complete.");
  } catch (error) {
    console.error(error);
    setStatus("Compression failed. Try a smaller file or another browser.");
  } finally {
    compressBtn.disabled = false;
  }
});