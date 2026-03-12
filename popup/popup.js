const progressSection = document.getElementById("progress-section");
const readySection = document.getElementById("ready-section");
const progressBar = document.getElementById("progress-bar");
const progressPercent = document.getElementById("progress-percent");
const progressStatus = document.getElementById("progress-status");

const STATUS_LABELS = {
  idle: "Waiting to start...",
  initializing: "Initializing model...",
  downloading: "Downloading model...",
  loading: "Loading model into memory...",
  ready: "Model ready"
};

function updateProgressUI(progress) {
  const label = STATUS_LABELS[progress.status] || progress.status;

  if (progress.status === "ready") {
    progressSection.style.display = "none";
    readySection.style.display = "flex";
    return;
  }

  progressSection.style.display = "flex";
  readySection.style.display = "none";

  progressBar.style.width = `${progress.percent}%`;
  progressPercent.textContent = `${progress.percent}%`;

  if (progress.file && progress.status === "downloading") {
    const shortFile = progress.file.split("/").pop();
    progressStatus.textContent = `${label} (${shortFile})`;
  } else {
    progressStatus.textContent = label;
  }
}

function pollProgress() {
  chrome.runtime.sendMessage({ type: "getProgress" }, (response) => {
    if (chrome.runtime.lastError) {
      setTimeout(pollProgress, 1000);
      return;
    }

    if (response) {
      updateProgressUI(response);
    }

    if (!response || response.status !== "ready") {
      setTimeout(pollProgress, 500);
    }
  });
}

chrome.runtime.sendMessage({ type: "ping" });
pollProgress();
