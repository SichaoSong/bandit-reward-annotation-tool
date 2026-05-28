const MIN_REASON_LENGTH = 50;
const STORAGE_KEY = "bandit-reward-annotations-v1";
const CSV_HANDLE_DB = "bandit-reward-csv-handles-v1";
const CSV_HANDLE_STORE = "handles";
const GOOGLE_IDENTITY_SCRIPT = "https://accounts.google.com/gsi/client";
const GOOGLE_DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

const state = {
  videos: [],
  currentIndex: -1,
  annotations: loadAnnotations(),
  drafts: {},
  resumeRows: [],
  resumeFileName: "",
  selectedRating: null,
  dirty: false,
  csvDirty: false,
  csvHandle: null,
  csvDirectoryHandle: null,
  csvFileName: "bandit_annotations.csv",
  datasetName: "bandit_annotations",
  loadMode: "replace",
  playbackRate: 1,
  isVideoLoading: false,
  loadingVideoId: "",
  googleAccessToken: "",
  googleTokenClient: null,
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  fitInstructionTextHeight();
  renderRatingButtons();
  bindEvents();
  render();
}

function cacheElements() {
  Object.assign(els, {
    appShell: document.getElementById("appShell"),
    setupTitle: document.getElementById("setupTitle"),
    topbarStatus: document.getElementById("topbarStatus"),
    sourceStatus: document.getElementById("sourceStatus"),
    localPane: document.getElementById("localPane"),
    drivePane: document.getElementById("drivePane"),
    videoFiles: document.getElementById("videoFiles"),
    folderPickerButton: document.getElementById("folderPickerButton"),
    videoFolder: document.getElementById("videoFolder"),
    clearVideosButton: document.getElementById("clearVideosButton"),
    startResumeCsv: document.getElementById("startResumeCsv"),
    startResumeStatus: document.getElementById("startResumeStatus"),
    driveLinks: document.getElementById("driveLinks"),
    loadDriveLinks: document.getElementById("loadDriveLinks"),
    googleClientId: document.getElementById("googleClientId"),
    googleAuthButton: document.getElementById("googleAuthButton"),
    googleAuthStatus: document.getElementById("googleAuthStatus"),
    instructionText: document.getElementById("instructionText"),
    videoPlayer: document.getElementById("videoPlayer"),
    emptyState: document.getElementById("emptyState"),
    emptyStateTitle: document.getElementById("emptyStateTitle"),
    videoError: document.getElementById("videoError"),
    videoErrorText: document.getElementById("videoErrorText"),
    rewindButton: document.getElementById("rewindButton"),
    playPauseButton: document.getElementById("playPauseButton"),
    forwardButton: document.getElementById("forwardButton"),
    playbackRate: document.getElementById("playbackRate"),
    timeStatus: document.getElementById("timeStatus"),
    currentTitle: document.getElementById("currentTitle"),
    currentSource: document.getElementById("currentSource"),
    videoCounter: document.getElementById("videoCounter"),
    ratingGroup: document.getElementById("ratingGroup"),
    ratingStatus: document.getElementById("ratingStatus"),
    reasonText: document.getElementById("reasonText"),
    memoText: document.getElementById("memoText"),
    charCount: document.getElementById("charCount"),
    validationMessage: document.getElementById("validationMessage"),
    previousButton: document.getElementById("previousButton"),
    saveButton: document.getElementById("saveButton"),
    nextButton: document.getElementById("nextButton"),
    queueList: document.getElementById("queueList"),
    progressStatus: document.getElementById("progressStatus"),
    saveStatus: document.getElementById("saveStatus"),
    saveFileName: document.getElementById("saveFileName"),
    resumeCsv: document.getElementById("resumeCsv"),
    resumeStatus: document.getElementById("resumeStatus"),
  });
}

function bindEvents() {
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.addEventListener("click", () => switchSourceTab(button.dataset.sourceTab));
  });
  document.querySelectorAll("[data-load-mode]").forEach((button) => {
    button.addEventListener("click", () => setLoadMode(button.dataset.loadMode));
  });

  els.videoFiles.addEventListener("change", (event) => addLocalFiles(event.target.files));
  els.videoFolder.addEventListener("change", (event) => addLocalFiles(event.target.files));
  els.folderPickerButton.addEventListener("click", chooseLocalFolder);
  els.clearVideosButton.addEventListener("click", clearCurrentVideos);
  els.startResumeCsv.addEventListener("change", (event) => loadResumeCsv(event.target.files?.[0]));
  els.resumeCsv.addEventListener("change", (event) => loadResumeCsv(event.target.files?.[0]));
  els.loadDriveLinks.addEventListener("click", addDriveLinks);
  els.googleAuthButton.addEventListener("click", connectGoogleDrive);
  els.reasonText.addEventListener("input", () => {
    state.dirty = true;
    renderValidation();
  });
  els.memoText.addEventListener("input", () => {
    state.dirty = true;
  });
  els.previousButton.addEventListener("click", () => moveToIndex(state.currentIndex - 1));
  els.saveButton.addEventListener("click", saveButtonHandler);
  els.nextButton.addEventListener("click", nextButtonHandler);
  els.rewindButton.addEventListener("click", () => skipVideo(-10));
  els.playPauseButton.addEventListener("click", togglePlayback);
  els.forwardButton.addEventListener("click", () => skipVideo(10));
  els.playbackRate.addEventListener("change", () => setPlaybackRate(Number(els.playbackRate.value)));
  els.videoPlayer.addEventListener("loadedmetadata", updatePlaybackUi);
  els.videoPlayer.addEventListener("timeupdate", updatePlaybackUi);
  els.videoPlayer.addEventListener("play", updatePlaybackUi);
  els.videoPlayer.addEventListener("pause", updatePlaybackUi);
  els.videoPlayer.addEventListener("ratechange", updatePlaybackUi);
  els.videoPlayer.addEventListener("error", showVideoError);

  document.addEventListener("keydown", handleKeyboard);
  window.addEventListener("resize", fitInstructionTextHeight);
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handleBeforeUnload);
}

function switchSourceTab(tab) {
  document.querySelectorAll("[data-source-tab]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.sourceTab === tab);
  });
  els.localPane.hidden = tab !== "local";
  els.drivePane.hidden = tab !== "drive";
}

function setLoadMode(mode) {
  state.loadMode = mode === "append" ? "append" : "replace";

  document.querySelectorAll("[data-load-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.loadMode === state.loadMode);
  });
}

function renderRatingButtons() {
  els.ratingGroup.innerHTML = "";

  for (let value = 1; value <= 7; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rating-button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");
    button.textContent = value;
    button.addEventListener("click", () => selectRating(value));
    els.ratingGroup.appendChild(button);
  }
}

function selectRating(value) {
  state.selectedRating = value;
  state.dirty = true;
  renderRatingState();
  renderValidation();
}

async function addLocalFiles(fileList) {
  const localItems = Array.from(fileList || []).map((file) => ({
    file,
    path: file.webkitRelativePath || file.name,
  }));
  const fileItems = localItems.filter(({ file }) => isVideoFile(file));
  const csvItems = localItems.filter(({ file }) => isCsvFile(file));

  await autoLoadMatchingResumeCsv(csvItems, fileItems);
  addLocalFileItems(fileItems);
  els.videoFiles.value = "";
  els.videoFolder.value = "";
}

async function chooseLocalFolder() {
  if (!window.showDirectoryPicker || !window.isSecureContext) {
    els.videoFolder.click();
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "read" });
    const { videoItems, csvItems } = await collectLocalFolderItems(
      directoryHandle,
      directoryHandle.name,
    );
    await autoLoadMatchingResumeCsv(csvItems, videoItems);
    addLocalFileItems(videoItems, { directoryHandle });
  } catch (error) {
    if (!isAbortError(error)) {
      els.saveStatus.textContent = "フォルダーを読み込めませんでした";
    }
  }
}

async function collectLocalFolderItems(directoryHandle, prefix) {
  const items = {
    videoItems: [],
    csvItems: [],
  };

  for await (const [name, handle] of directoryHandle.entries()) {
    const path = `${prefix}/${name}`;

    if (handle.kind === "file") {
      const file = await handle.getFile();
      const item = { file, path };

      if (isVideoFile(file)) {
        items.videoItems.push(item);
      } else if (isCsvFile(file)) {
        items.csvItems.push(item);
      }
    } else if (handle.kind === "directory") {
      const childItems = await collectLocalFolderItems(handle, path);
      items.videoItems.push(...childItems.videoItems);
      items.csvItems.push(...childItems.csvItems);
    }
  }

  return items;
}

function addLocalFileItems(fileItems, options = {}) {
  const videos = fileItems.sort(compareFileItemsByPath).map(({ file, path }) => {
    const src = URL.createObjectURL(file);
    return {
      id: `local:${path}:${file.size}:${file.lastModified}`,
      videoId: path,
      name: file.name,
      source: "local",
      sourceLabel: "Local",
      src,
      blobUrl: src,
    };
  });

  return addVideos(videos, { csvDirectoryHandle: options.directoryHandle || null });
}

async function autoLoadMatchingResumeCsv(csvItems, fileItems) {
  if (!csvItems.length || !fileItems.length) {
    return false;
  }

  const videoIds = new Set(fileItems.map((item) => item.path));
  const expectedFileName = deriveCsvFileNameForFileItems(fileItems).toLowerCase();
  const candidates = [];

  for (const item of csvItems.sort(compareFileItemsByPath)) {
    try {
      const resumeRows = await readResumeRowsFromCsvFile(item.file);
      const matchedRows = resumeRows.filter((row) => videoIds.has(row.video_id)).length;

      if (!matchedRows) {
        continue;
      }

      candidates.push({
        item,
        resumeRows,
        matchedRows,
        restoredAnnotations: resumeRows.filter(
          (row) => videoIds.has(row.video_id) && hasCsvAnnotation(row),
        ).length,
        expectedNameMatch: (item.file.name || "").toLowerCase() === expectedFileName,
      });
    } catch {
      // Ignore unrelated CSV files in the selected folder.
    }
  }

  if (!candidates.length) {
    setResumeStatus("フォルダー内に一致するCSVは見つかりませんでした");
    return false;
  }

  candidates.sort(
    (a, b) =>
      b.matchedRows - a.matchedRows ||
      Number(b.expectedNameMatch) - Number(a.expectedNameMatch) ||
      b.restoredAnnotations - a.restoredAnnotations ||
      compareFileItemsByPath(a.item, b.item),
  );

  const bestCandidate = candidates[0];
  setResumeRowsFromCsv(bestCandidate.item.file, bestCandidate.resumeRows);
  setResumeStatus(`${bestCandidate.item.file.name || "CSV"} を自動読み込みしました`);
  return true;
}

function deriveCsvFileNameForFileItems(fileItems) {
  const videos = fileItems.map(({ file, path }) => ({
    videoId: path,
    name: file.name,
    source: "local",
  }));

  return `${sanitizeFileName(deriveDatasetName(videos))}_annotations.csv`;
}

async function addDriveLinks() {
  const lines = els.driveLinks.value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const videos = lines.map((line, index) => {
    const id = extractDriveFileId(line);
    const useAuth = Boolean(id && state.googleAccessToken);
    const src = id ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}` : line;
    const videoId = id || `drive-url-${index + 1}`;

    return {
      id: `${useAuth ? "drive-auth" : "drive"}:${videoId}`,
      videoId,
      name: id ? `Google Drive ${id}` : line,
      source: useAuth ? "drive-auth" : "drive",
      sourceLabel: useAuth ? "Google Drive (login)" : "Google Drive",
      src: useAuth ? "" : src,
      authFileId: useAuth ? id : "",
      originalUrl: line,
    };
  });

  addVideos(videos);
}

function addVideos(videos, options = {}) {
  if (!videos.length) {
    return false;
  }

  if (state.loadMode === "replace") {
    if (!confirmAbandonDirtyWork()) {
      videos.forEach(revokeVideoSource);
      return false;
    }

    clearVideoQueue();
    configureCsvForVideos(videos, options);
  } else if (!state.videos.length) {
    configureCsvForVideos(videos, options);
  }

  const existingIds = new Set(state.videos.map((video) => video.id));
  const uniqueVideos = orderVideosForQueue(videos.filter((video) => !existingIds.has(video.id)));

  state.videos.push(...uniqueVideos);
  const resumeResult = applyResumeCsvToCurrentVideos();
  const startIndex = resumeResult.matchedVideos ? findResumeStartIndex() : 0;

  if (state.currentIndex === -1 && state.videos.length > 0) {
    setCurrentIndex(startIndex, false);
  } else if (resumeResult.matchedVideos) {
    setCurrentIndex(startIndex, false);
  }

  render();
  return true;
}

async function loadResumeCsv(file) {
  if (!file) {
    return;
  }

  try {
    const resumeRows = await readResumeRowsFromCsvFile(file);

    if (state.videos.length && (state.dirty || hasDrafts())) {
      const shouldRestore = window.confirm("未保存の入力があります。CSVの内容で作業履歴を復元しますか？");

      if (!shouldRestore) {
        return;
      }
    }

    setResumeRowsFromCsv(file, resumeRows);

    const result = applyResumeCsvToCurrentVideos();

    if (!state.videos.length) {
      setResumeStatus("CSV読み込み済み。同じフォルダーを読み込むと復元します");
    } else if (result.matchedVideos) {
      setCurrentIndex(findResumeStartIndex(), false);
    }

    render();
  } catch (error) {
    setResumeStatus(error?.message || "CSVを読み込めませんでした");
  } finally {
    els.resumeCsv.value = "";
    els.startResumeCsv.value = "";
  }
}

async function readResumeRowsFromCsvFile(file) {
  const rows = parseCsvObjects(await file.text());
  const resumeRows = normalizeResumeRows(rows);

  if (!resumeRows.length) {
    throw new Error("CSV内にvideo_idが見つかりませんでした");
  }

  return resumeRows;
}

function setResumeRowsFromCsv(file, resumeRows) {
  state.resumeRows = resumeRows;
  state.resumeFileName = file.name || "";

  if (file.name) {
    state.csvFileName = file.name;
    state.csvHandle = null;
  }
}

function applyResumeCsvToCurrentVideos() {
  const result = {
    matchedVideos: 0,
    restoredAnnotations: 0,
    totalRows: state.resumeRows.length,
  };

  if (!state.resumeRows.length || !state.videos.length) {
    return result;
  }

  const rowByVideoId = new Map();
  const orderByVideoId = new Map();

  state.resumeRows.forEach((row) => {
    rowByVideoId.set(row.video_id, row);

    if (row.presentation_order && !orderByVideoId.has(row.video_id)) {
      orderByVideoId.set(row.video_id, row.presentation_order);
    }
  });

  result.matchedVideos = state.videos.filter((video) => rowByVideoId.has(video.videoId)).length;

  if (!result.matchedVideos) {
    setResumeStatus("CSVを読み込みましたが、現在の動画とは一致しません");
    return result;
  }

  if (state.resumeFileName) {
    state.csvFileName = state.resumeFileName;
    state.csvHandle = null;
  }

  if (state.videos.every((video) => orderByVideoId.has(video.videoId))) {
    state.videos.sort(
      (a, b) => orderByVideoId.get(a.videoId) - orderByVideoId.get(b.videoId),
    );
  }

  state.videos.forEach((video) => {
    delete state.annotations[video.id];
    delete state.drafts[video.id];
  });

  state.videos.forEach((video) => {
    const row = rowByVideoId.get(video.videoId);

    if (!row || !hasCsvAnnotation(row)) {
      return;
    }

    state.annotations[video.id] = {
      key: video.id,
      video_id: video.videoId,
      video_name: row.video_name || video.name,
      source: row.source || video.source,
      rating: row.rating,
      reason: row.reason,
      memo: row.memo,
      instruction: row.instruction || els.instructionText.value.trim(),
      annotated_at: row.annotated_at,
    };
    result.restoredAnnotations += 1;
  });

  state.dirty = false;
  state.csvDirty = false;
  persistAnnotations();
  setResumeStatus(
    `CSVから${result.restoredAnnotations}件の作業履歴を復元しました`,
  );

  return result;
}

function findResumeStartIndex() {
  const firstIncompleteIndex = state.videos.findIndex((video) => !state.annotations[video.id]);
  return firstIncompleteIndex === -1 ? 0 : firstIncompleteIndex;
}

function orderVideosForQueue(videos) {
  const sorted = [...videos].sort(compareVideosById);

  if (sorted.length <= 1) {
    return sorted;
  }

  const seed = hashString(sorted.map((video) => video.videoId).join("\n"));
  return seededShuffle(sorted, seed);
}

function seededShuffle(videos, seed) {
  const shuffled = [...videos];
  let currentSeed = seed || 1;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    currentSeed = nextSeed(currentSeed);
    const swapIndex = currentSeed % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function compareFileItemsByPath(a, b) {
  return a.path.localeCompare(b.path, "ja", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareVideosById(a, b) {
  return String(a.videoId).localeCompare(String(b.videoId), "ja", {
    numeric: true,
    sensitivity: "base",
  });
}

function hashString(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextSeed(seed) {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

function configureCsvForVideos(videos, options = {}) {
  state.datasetName = deriveDatasetName(videos);
  state.csvFileName = `${sanitizeFileName(state.datasetName)}_annotations.csv`;
  state.csvHandle = null;
  state.csvDirectoryHandle = options.csvDirectoryHandle || null;
  els.saveStatus.textContent = state.csvDirectoryHandle
    ? "動画フォルダー内CSV準備済み"
    : "CSV準備済み";
  els.saveFileName.textContent = state.csvFileName;
}

function deriveDatasetName(videos) {
  const localVideos = videos.filter((video) => video.source === "local");

  if (localVideos.length) {
    const folderNames = localVideos
      .map((video) => video.videoId.split("/"))
      .filter((parts) => parts.length > 1)
      .map((parts) => parts[0]);
    const uniqueFolderNames = Array.from(new Set(folderNames));

    if (uniqueFolderNames.length === 1) {
      return uniqueFolderNames[0];
    }

    if (uniqueFolderNames.length > 1) {
      return "selected_video_folders";
    }

    if (localVideos.length === 1) {
      return stripExtension(localVideos[0].name);
    }

    return "selected_videos";
  }

  if (videos.some((video) => video.source.startsWith("drive"))) {
    return "google_drive_videos";
  }

  return "bandit_annotations";
}

function stripExtension(fileName) {
  return fileName.replace(/\.[^.]+$/, "");
}

function sanitizeFileName(value) {
  const normalized = String(value || "bandit_annotations")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || "bandit_annotations";
}

function clearCurrentVideos() {
  if (!state.videos.length) {
    return;
  }

  if (!confirmAbandonDirtyWork()) {
    return;
  }

  clearVideoQueue();
  render();
}

function clearVideoQueue() {
  state.videos.forEach(revokeVideoSource);
  state.videos = [];
  state.currentIndex = -1;
  state.selectedRating = null;
  state.drafts = {};
  state.dirty = false;
  state.csvDirty = false;
  state.isVideoLoading = false;
  state.loadingVideoId = "";
  state.csvHandle = null;
  state.csvDirectoryHandle = null;
  state.datasetName = "bandit_annotations";
  state.csvFileName = "bandit_annotations.csv";
  els.reasonText.value = "";
  els.memoText.value = "";
  els.videoError.hidden = true;
  els.emptyStateTitle.textContent = "動画を読み込んでください";
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute("src");
  els.videoPlayer.load();
  els.saveStatus.textContent = "未保存";
  els.saveFileName.textContent = "動画を読み込むとCSV名が決まります";
  updatePlaybackUi();
}

function revokeVideoSource(video) {
  if (video?.blobUrl) {
    URL.revokeObjectURL(video.blobUrl);
    video.blobUrl = "";
  }
}

function confirmAbandonDirtyWork() {
  if (!state.dirty && !hasDrafts()) {
    return true;
  }

  return window.confirm("未保存の入力があります。この動画セットを切り替えますか？");
}

function hasDrafts() {
  return Object.keys(state.drafts).length > 0;
}

async function resolveVideoSrc(video) {
  if (video.src) {
    return video.src;
  }

  if (!video.authFileId) {
    throw new Error("動画URLがありません。");
  }

  if (!state.googleAccessToken) {
    throw new Error("Googleログインが必要です。");
  }

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(video.authFileId)}?alt=media`,
    {
      headers: {
        Authorization: `Bearer ${state.googleAccessToken}`,
      },
    },
  );

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      state.googleAccessToken = "";
      els.googleAuthStatus.textContent = "Googleログインをやり直してください";
    }

    throw new Error(`Drive動画を取得できませんでした (${response.status})`);
  }

  const blob = await response.blob();
  video.blobUrl = URL.createObjectURL(blob);
  video.src = video.blobUrl;
  return video.src;
}

async function setCurrentIndex(index, autoplay) {
  if (index < 0 || index >= state.videos.length) {
    return;
  }

  state.currentIndex = index;
  state.isVideoLoading = true;
  const video = getCurrentVideo();
  state.loadingVideoId = video.id;
  const annotation = state.drafts[video.id] || state.annotations[video.id];

  state.selectedRating = annotation?.rating || null;
  els.reasonText.value = annotation?.reason || "";
  els.memoText.value = annotation?.memo || "";
  state.dirty = Boolean(state.drafts[video.id]);
  resetPlaybackRate();

  els.videoError.hidden = true;
  els.emptyStateTitle.textContent = video.authFileId ? "Drive動画を読み込み中" : "動画を読み込み中";
  els.videoPlayer.pause();
  els.videoPlayer.removeAttribute("src");
  els.videoPlayer.load();
  render();

  try {
    const src = await resolveVideoSrc(video);

    if (state.loadingVideoId !== video.id || getCurrentVideo()?.id !== video.id) {
      return;
    }

    els.videoPlayer.src = src;
    els.videoPlayer.playbackRate = state.playbackRate;
    els.videoPlayer.load();
    state.isVideoLoading = false;
    state.loadingVideoId = "";

    if (autoplay) {
      els.videoPlayer.play().catch(() => {});
    }
  } catch (error) {
    if (state.loadingVideoId !== video.id) {
      return;
    }

    state.isVideoLoading = false;
    state.loadingVideoId = "";
    showVideoError(error);
  }

  render();
}

async function moveToIndex(index) {
  if (index === state.currentIndex) {
    return;
  }

  if (index < 0 || index >= state.videos.length) {
    return;
  }

  const currentVideo = getCurrentVideo();
  const isMovingBackward = index < state.currentIndex;

  if (currentVideo && !isMovingBackward && !canSaveCurrent()) {
    renderValidation(true);
    return;
  }

  if (currentVideo && canSaveCurrent()) {
    await saveCurrentAnnotation({ syncCsv: false });
  } else if (currentVideo) {
    saveCurrentDraft();
  }

  await setCurrentIndex(index, false);
}

async function saveButtonHandler() {
  if (!canSaveCurrent()) {
    renderValidation(true);
    return;
  }

  try {
    await saveCurrentAnnotation({ syncCsv: true });
  } catch {
    els.saveStatus.textContent = "CSV保存エラー";
  }
}

async function nextButtonHandler() {
  if (!canSaveCurrent()) {
    renderValidation(true);
    return;
  }

  if (state.currentIndex >= state.videos.length - 1) {
    return;
  }

  await saveCurrentAnnotation({ syncCsv: false });
  await setCurrentIndex(state.currentIndex + 1, true);
}

async function saveCurrentAnnotation({ syncCsv }) {
  const video = getCurrentVideo();
  if (!video) {
    return;
  }

  const annotation = {
    key: video.id,
    video_id: video.videoId,
    video_name: video.name,
    source: video.source,
    rating: state.selectedRating,
    reason: els.reasonText.value.trim(),
    memo: els.memoText.value.trim(),
    instruction: els.instructionText.value.trim(),
    annotated_at: new Date().toISOString(),
  };

  state.annotations[video.id] = annotation;
  delete state.drafts[video.id];
  state.dirty = false;
  persistAnnotations();

  if (syncCsv) {
    const savedCsv = await syncCsvAfterAnnotation({ allowPicker: true, allowDownload: true });
    state.csvDirty = !savedCsv;
  } else {
    state.csvDirty = true;
    els.saveStatus.textContent = "ブラウザ保存済み・CSV未保存";
  }

  render();
}

function saveCurrentDraft() {
  const video = getCurrentVideo();

  if (!video) {
    return;
  }

  const reason = els.reasonText.value;
  const memo = els.memoText.value;
  const hasDraft = Boolean(state.selectedRating || reason.trim() || memo.trim());

  if (!hasDraft) {
    delete state.drafts[video.id];
    state.dirty = false;
    return;
  }

  state.drafts[video.id] = {
    rating: state.selectedRating,
    reason,
    memo,
  };
  state.dirty = true;
}

async function connectGoogleDrive() {
  const clientId = els.googleClientId.value.trim();

  if (!clientId) {
    els.googleAuthStatus.textContent = "OAuth Client IDを入力してください";
    return;
  }

  els.googleAuthButton.disabled = true;
  els.googleAuthStatus.textContent = "Googleログインを準備中";

  try {
    await loadExternalScript(GOOGLE_IDENTITY_SCRIPT);
    state.googleTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_DRIVE_READONLY_SCOPE,
      callback: (response) => {
        els.googleAuthButton.disabled = false;

        if (response.error) {
          els.googleAuthStatus.textContent = "Googleログインに失敗しました";
          return;
        }

        state.googleAccessToken = response.access_token;
        els.googleAuthStatus.textContent = "Googleログイン済み";
      },
    });
    state.googleTokenClient.requestAccessToken({ prompt: "consent" });
  } catch {
    els.googleAuthButton.disabled = false;
    els.googleAuthStatus.textContent = "Googleログインを開始できませんでした";
  }
}

function loadExternalScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function canUseNativeFileSave() {
  return Boolean(window.isSecureContext && (state.csvDirectoryHandle || window.showSaveFilePicker));
}

async function syncCsvAfterAnnotation({ allowPicker, allowDownload }) {
  if (canUseNativeFileSave()) {
    try {
      const handle = await ensureCsvHandle({ allowPicker });

      if (handle) {
        await writeCsvToHandle(handle);
        els.saveStatus.textContent = state.csvDirectoryHandle
          ? "動画フォルダー内CSV保存済み"
          : "CSV保存済み";
        return true;
      }
    } catch (error) {
      state.csvHandle = null;

      if (isAbortError(error)) {
        els.saveStatus.textContent = "CSV保存キャンセル・ブラウザ内には保存済み";
        return false;
      }
    }
  }

  if (allowDownload) {
    downloadCsv("CSVをDownloadsに保存しました");
    return true;
  }

  return false;
}

function isAbortError(error) {
  return error?.name === "AbortError";
}

async function ensureCsvHandle({ allowPicker }) {
  if (state.csvHandle) {
    return state.csvHandle;
  }

  const folderHandle = await ensureCsvHandleInSelectedDirectory({ allowPicker });

  if (folderHandle) {
    return folderHandle;
  }

  const storedHandle = await loadStoredCsvHandle(state.csvFileName);

  const hasStoredPermission =
    storedHandle &&
    (allowPicker
      ? await requestFileWritePermission(storedHandle)
      : await hasFileWritePermission(storedHandle));

  if (hasStoredPermission) {
    state.csvHandle = storedHandle;
    return state.csvHandle;
  }

  if (!allowPicker) {
    return null;
  }

  if (!window.showSaveFilePicker) {
    return null;
  }

  const pickedHandle = await showCsvSavePicker();
  state.csvHandle = pickedHandle;
  await storeCsvHandle(state.csvFileName, pickedHandle);
  return state.csvHandle;
}

async function ensureCsvHandleInSelectedDirectory({ allowPicker }) {
  if (!state.csvDirectoryHandle) {
    return null;
  }

  const hasPermission = allowPicker
    ? await requestFileWritePermission(state.csvDirectoryHandle)
    : await hasFileWritePermission(state.csvDirectoryHandle);

  if (!hasPermission) {
    return null;
  }

  const fileHandle = await state.csvDirectoryHandle.getFileHandle(state.csvFileName, {
    create: true,
  });
  state.csvHandle = fileHandle;
  await storeCsvHandle(state.csvFileName, fileHandle);
  return state.csvHandle;
}

async function showCsvSavePicker() {
  const pickerOptions = {
    suggestedName: state.csvFileName,
    startIn: state.csvDirectoryHandle || "downloads",
    types: [
      {
        description: "CSV",
        accept: { "text/csv": [".csv"] },
      },
    ],
  };

  try {
    return await window.showSaveFilePicker(pickerOptions);
  } catch (error) {
    if (error.name === "AbortError") {
      throw error;
    }

    return window.showSaveFilePicker({
      suggestedName: state.csvFileName,
      types: pickerOptions.types,
    });
  }
}

async function requestFileWritePermission(fileHandle) {
  const options = { mode: "readwrite" };

  if (await hasFileWritePermission(fileHandle)) {
    return true;
  }

  if (!fileHandle?.requestPermission) {
    return false;
  }

  try {
    return (await fileHandle.requestPermission(options)) === "granted";
  } catch {
    return false;
  }
}

async function hasFileWritePermission(fileHandle) {
  if (!fileHandle?.queryPermission) {
    return false;
  }

  try {
    return (await fileHandle.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

async function writeCsvToHandle(fileHandle) {
  const writable = await fileHandle.createWritable();
  await writable.write(createCsv());
  await writable.close();
}

function downloadCsv(statusMessage = "CSV保存済み") {
  const csv = createCsv();
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = state.csvFileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  els.saveStatus.textContent = statusMessage;
}

function handlePageHide() {
  if (!hasUnsavedCsvChanges()) {
    return;
  }

  attemptExistingCsvSync();
}

function handleBeforeUnload(event) {
  if (!hasUnsavedCsvChanges()) {
    return;
  }

  attemptExistingCsvSync();
  if (!state.csvHandle) {
    downloadCsv("CSV保存を試みました");
  }
  event.preventDefault();
  event.returnValue = "";
}

function hasUnsavedCsvChanges() {
  return state.csvDirty && state.videos.some((video) => state.annotations[video.id]);
}

async function attemptExistingCsvSync() {
  if (!canUseNativeFileSave()) {
    return false;
  }

  try {
    const handle = await ensureCsvHandle({ allowPicker: false });

    if (!handle) {
      return false;
    }

    await writeCsvToHandle(handle);
    state.csvDirty = false;
    els.saveStatus.textContent = state.csvDirectoryHandle
      ? "動画フォルダー内CSV保存済み"
      : "CSV保存済み";
    return true;
  } catch {
    return false;
  }
}

async function loadStoredCsvHandle(fileName) {
  try {
    const db = await openCsvHandleDb();
    const tx = db.transaction(CSV_HANDLE_STORE, "readonly");
    const record = await idbRequest(tx.objectStore(CSV_HANDLE_STORE).get(fileName));
    await idbTransactionDone(tx);
    db.close();
    return record?.handle || null;
  } catch {
    return null;
  }
}

async function storeCsvHandle(fileName, handle) {
  try {
    const db = await openCsvHandleDb();
    const tx = db.transaction(CSV_HANDLE_STORE, "readwrite");
    tx.objectStore(CSV_HANDLE_STORE).put({ fileName, handle });
    await idbTransactionDone(tx);
    db.close();
  } catch {
    // Remembering the handle is a convenience. The current session still works without it.
  }
}

function openCsvHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CSV_HANDLE_DB, 1);

    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CSV_HANDLE_STORE)) {
        request.result.createObjectStore(CSV_HANDLE_STORE, { keyPath: "fileName" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbTransactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function parseCsvObjects(text) {
  const records = parseCsvRecords(text).filter((row) => row.some((cell) => cell.trim()));

  if (records.length < 2) {
    return [];
  }

  const headers = records[0].map((header) => normalizeCsvHeader(header));

  return records.slice(1).map((record) =>
    headers.reduce((row, header, index) => {
      if (header) {
        row[header] = record[index] ?? "";
      }

      return row;
    }, {}),
  );
}

function parseCsvRecords(text) {
  const records = [];
  let record = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/^\ufeff/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      record.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      record.push(cell);
      records.push(record);
      record = [];
      cell = "";

      if (char === "\r" && input[index + 1] === "\n") {
        index += 1;
      }
    } else {
      cell += char;
    }
  }

  if (cell || record.length || input.endsWith(",")) {
    record.push(cell);
    records.push(record);
  }

  return records;
}

function normalizeResumeRows(rows) {
  return rows
    .map((row) => {
      const videoId = readCsvField(row, "video_id", "videoId").trim();

      if (!videoId) {
        return null;
      }

      return {
        annotated_at: readCsvField(row, "annotated_at"),
        presentation_order: parsePositiveInteger(readCsvField(row, "presentation_order")),
        video_id: videoId,
        video_name: readCsvField(row, "video_name", "videoName"),
        source: readCsvField(row, "source"),
        rating: parseRating(readCsvField(row, "rating")),
        reason: readCsvField(row, "reason"),
        memo: readCsvField(row, "memo"),
        instruction: readCsvField(row, "instruction"),
      };
    })
    .filter(Boolean);
}

function normalizeCsvHeader(header) {
  return String(header || "").trim().replace(/^\ufeff/, "");
}

function readCsvField(row, ...names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) {
      return String(row[name] ?? "");
    }
  }

  return "";
}

function parsePositiveInteger(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseRating(value) {
  const number = Number.parseInt(value, 10);
  return Number.isFinite(number) && number >= 1 && number <= 7 ? number : null;
}

function hasCsvAnnotation(row) {
  return Number.isInteger(row.rating);
}

function createCsv() {
  const headers = [
    "annotated_at",
    "presentation_order",
    "video_id",
    "video_name",
    "source",
    "rating",
    "reason",
    "memo",
    "instruction",
  ];
  const records = state.videos.map((video, index) => {
    const annotation = state.annotations[video.id];

    return {
      annotated_at: annotation?.annotated_at || "",
      presentation_order: index + 1,
      video_id: video.videoId,
      video_name: video.name,
      source: video.source,
      rating: annotation?.rating || "",
      reason: annotation?.reason || "",
      memo: annotation?.memo || "",
      instruction: annotation?.instruction || els.instructionText.value.trim(),
    };
  });
  const rows = records.map((record) =>
    headers.map((header) => csvCell(record[header])).join(","),
  );

  return `\ufeff${headers.join(",")}\n${rows.join("\n")}`;
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function setResumeStatus(message) {
  els.resumeStatus.textContent = message;
  els.startResumeStatus.textContent = message;
}

function fitInstructionTextHeight() {
  if (!els.instructionText) {
    return;
  }

  els.instructionText.style.height = "auto";

  if (Number.isFinite(els.instructionText.scrollHeight) && els.instructionText.scrollHeight > 0) {
    els.instructionText.style.height = `${els.instructionText.scrollHeight + 2}px`;
  }
}

function render() {
  const currentVideo = getCurrentVideo();
  const completedCount = state.videos.filter((video) => state.annotations[video.id]).length;
  const totalCount = state.videos.length;
  const canControlVideo = Boolean(currentVideo) && !state.isVideoLoading;

  els.appShell.classList.toggle("is-working", totalCount > 0);
  els.setupTitle.textContent = totalCount > 0 ? "動画セット" : "動画を読み込む";
  els.sourceStatus.textContent = `${totalCount}本`;
  els.progressStatus.textContent = `${completedCount} / ${totalCount}完了`;
  els.clearVideosButton.disabled = totalCount === 0;
  els.saveFileName.textContent = totalCount > 0
    ? state.csvFileName
    : "動画を読み込むとCSV名が決まります";
  els.previousButton.disabled = state.currentIndex <= 0;
  els.rewindButton.disabled = !canControlVideo;
  els.playPauseButton.disabled = !canControlVideo;
  els.forwardButton.disabled = !canControlVideo;
  els.playbackRate.disabled = !canControlVideo;
  els.currentTitle.textContent = currentVideo?.name || "未選択";
  els.currentSource.textContent = currentVideo
    ? `${currentVideo.sourceLabel} / ${currentVideo.videoId}`
    : "-";
  els.videoCounter.textContent = totalCount > 0 ? `${state.currentIndex + 1} / ${totalCount}` : "0 / 0";
  els.topbarStatus.textContent = currentVideo ? currentVideo.name : "動画未選択";
  els.emptyState.hidden = Boolean(currentVideo) && !state.isVideoLoading;
  els.nextButton.textContent = "次へ";

  if (!currentVideo) {
    els.emptyStateTitle.textContent = "動画を読み込んでください";
  }

  fitInstructionTextHeight();
  renderRatingState();
  renderValidation();
  renderQueue();
  updatePlaybackUi();
}

function renderRatingState() {
  Array.from(els.ratingGroup.children).forEach((button, index) => {
    const value = index + 1;
    const selected = state.selectedRating === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });

  els.ratingStatus.textContent = state.selectedRating ? `${state.selectedRating} / 7` : "未選択";
}

function renderValidation(forceMessage = false) {
  const reasonLength = els.reasonText.value.trim().length;
  const hasRating = Boolean(state.selectedRating);
  const hasReason = reasonLength >= MIN_REASON_LENGTH;
  const hasVideo = Boolean(getCurrentVideo());
  const hasNextVideo = state.currentIndex >= 0 && state.currentIndex < state.videos.length - 1;
  const canSave = hasVideo && hasRating && hasReason;
  const remaining = Math.max(0, MIN_REASON_LENGTH - reasonLength);

  els.charCount.textContent = `${reasonLength} / ${MIN_REASON_LENGTH}`;
  els.validationMessage.classList.toggle("is-valid", canSave);
  els.validationMessage.classList.toggle("is-invalid", !canSave && (forceMessage || reasonLength > 0 || hasRating));
  els.saveButton.disabled = !canSave;
  els.nextButton.disabled = !canSave || !hasNextVideo;

  if (!hasVideo) {
    els.validationMessage.textContent = "動画が必要です";
  } else if (!hasRating) {
    els.validationMessage.textContent = "採点を選択してください";
  } else if (!hasReason) {
    els.validationMessage.textContent = `あと${remaining}文字必要です`;
  } else {
    els.validationMessage.textContent = "保存できます";
  }
}

function renderQueue() {
  els.queueList.innerHTML = "";

  state.videos.forEach((video, index) => {
    const annotation = state.annotations[video.id];
    const item = document.createElement("li");
    const button = document.createElement("button");
    const number = document.createElement("span");
    const title = document.createElement("span");
    const rating = document.createElement("span");

    button.type = "button";
    button.className = "queue-item";
    button.classList.toggle("is-active", index === state.currentIndex);
    button.addEventListener("click", () => moveToIndex(index));

    number.className = "queue-index";
    number.textContent = String(index + 1);

    title.className = "queue-title";
    title.textContent = video.name;

    rating.className = annotation ? "queue-rating" : "queue-rating is-empty";
    rating.textContent = annotation ? annotation.rating : "-";

    button.append(number, title, rating);
    item.append(button);
    els.queueList.append(item);
  });
}

function getCurrentVideo() {
  return state.videos[state.currentIndex] || null;
}

function canSaveCurrent() {
  return Boolean(
    getCurrentVideo() &&
      state.selectedRating &&
      els.reasonText.value.trim().length >= MIN_REASON_LENGTH,
  );
}

function showVideoError(error) {
  if (getCurrentVideo()) {
    els.videoError.hidden = false;
    els.videoErrorText.textContent = error?.message || "共有設定、ログイン状態、または動画形式を確認してください。";
  }
}

function skipVideo(seconds) {
  const video = els.videoPlayer;

  if (!getCurrentVideo() || Number.isNaN(video.duration)) {
    return;
  }

  const nextTime = Math.min(Math.max(video.currentTime + seconds, 0), video.duration || 0);
  video.currentTime = nextTime;
  updatePlaybackUi();
}

function togglePlayback() {
  if (!getCurrentVideo()) {
    return;
  }

  if (els.videoPlayer.paused) {
    els.videoPlayer.play().catch(() => {});
  } else {
    els.videoPlayer.pause();
  }

  updatePlaybackUi();
}

function setPlaybackRate(rate) {
  if (!Number.isFinite(rate) || rate <= 0) {
    return;
  }

  state.playbackRate = rate;
  els.videoPlayer.playbackRate = rate;
  updatePlaybackUi();
}

function resetPlaybackRate() {
  state.playbackRate = 1;

  if (els.videoPlayer) {
    els.videoPlayer.playbackRate = 1;
  }
}

function updatePlaybackUi() {
  if (!els.videoPlayer || !els.timeStatus) {
    return;
  }

  const duration = Number.isFinite(els.videoPlayer.duration) ? els.videoPlayer.duration : 0;
  const currentTime = Number.isFinite(els.videoPlayer.currentTime) ? els.videoPlayer.currentTime : 0;

  els.playPauseButton.textContent = els.videoPlayer.paused ? "再生" : "停止";
  els.playbackRate.value = String(state.playbackRate);
  els.timeStatus.textContent = `${formatTime(currentTime)} / ${formatTime(duration)}`;
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = String(safeSeconds % 60).padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}

function isVideoFile(file) {
  if (file.type.startsWith("video/")) {
    return true;
  }

  return /\.(mp4|mov|m4v|webm|avi|mkv|ogv)$/i.test(file.name);
}

function isCsvFile(file) {
  return file.type === "text/csv" || /\.csv$/i.test(file.name);
}

function extractDriveFileId(input) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /^([a-zA-Z0-9_-]{20,})$/,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return "";
}

function loadAnnotations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function persistAnnotations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.annotations));
}

function handleKeyboard(event) {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  const isTyping = activeTag === "textarea" || activeTag === "input";

  if (!isTyping && /^[1-7]$/.test(event.key)) {
    selectRating(Number(event.key));
  }

  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveButtonHandler();
  }
}
