const dialog = document.querySelector(".photo-dialog:not([data-collection-dialog])");

if (dialog && typeof dialog.showModal === "function") {
  const photo = dialog.querySelector(".dialog-image");
  const caption = dialog.querySelector("#photo-caption");
  const count = dialog.querySelector("[data-count]");
  const controls = dialog.querySelector(".dialog-controls");
  let gallery = [];
  let current = 0;
  let trigger;

  function showPhoto(index) {
    current = (index + gallery.length) % gallery.length;
    const target = gallery[current];
    photo.src = target.href;
    photo.alt = target.querySelector("img").alt;
    caption.textContent = target.querySelector(".photo-label").firstChild.textContent.trim();
    count.textContent = `${current + 1} of ${gallery.length}`;
  }

  document.querySelectorAll("[data-photo]").forEach(link => {
    link.addEventListener("click", event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      gallery = Array.from(link.closest("[data-gallery]").querySelectorAll("[data-photo]"));
      controls.hidden = gallery.length < 2;
      trigger = link;
      showPhoto(gallery.indexOf(link));
      dialog.showModal();
    });
  });

  dialog.querySelector("[data-previous]").addEventListener("click", () => showPhoto(current - 1));
  dialog.querySelector("[data-next]").addEventListener("click", () => showPhoto(current + 1));
  dialog.addEventListener("keydown", event => {
    if (gallery.length < 2) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      showPhoto(current + (event.key === "ArrowLeft" ? -1 : 1));
    }
  });
  dialog.addEventListener("close", () => trigger?.focus());
}

const clips = Array.from(document.querySelectorAll("video"));
for (const clip of clips) {
  clip.addEventListener("play", () => {
    for (const other of clips) {
      if (other !== clip && !other.paused) other.pause();
    }
  });
}


for (const clip of document.querySelectorAll("[data-hover-preview]")) {
  const video = clip.querySelector("video");
  let hoverPlaying = false;
  clip.addEventListener("pointerenter", event => {
    if (event.pointerType !== "mouse" || !video.paused) return;
    video.muted = true;
    hoverPlaying = true;
    video.play().catch(() => {});
  });
  clip.addEventListener("pointerleave", event => {
    if (event.pointerType !== "mouse" || !hoverPlaying) return;
    hoverPlaying = false;
    video.pause();
  });
}

const collectionDialog = document.querySelector("[data-collection-dialog]");

for (const gallery of document.querySelectorAll("[data-media-switcher]")) {
  const preview = gallery.querySelector("[data-stage-preview]");
  const video = gallery.querySelector("[data-stage-video]");
  const thumbs = gallery.querySelector(".media-thumbnails");
  const buttons = Array.from(thumbs.querySelectorAll("[data-preview-src]"));
  const trailer = thumbs.querySelector("[data-preview-trailer]");
  const collection = gallery.querySelector("[data-open-collection]");
  let selected = null;
  let resumeVideo = false;

  function display(button, playTrailer = false) {
    if (button) {
      if (video && preview.hidden) {
        resumeVideo = !video.paused;
        if (resumeVideo) video.pause();
      }
      if (preview.getAttribute("src") !== button.dataset.previewSrc) {
        preview.src = button.dataset.previewSrc;
        preview.alt = button.dataset.previewAlt;
      }
      preview.hidden = false;
      return;
    }
    preview.hidden = true;
    if (video && (resumeVideo || playTrailer)) {
      resumeVideo = false;
      video.play().catch(() => {});
    }
  }

  function select(button) {
    selected = button;
    for (const item of buttons) item.setAttribute("aria-pressed", String(item === selected));
    trailer?.setAttribute("aria-pressed", String(selected === null));
  }

  for (const button of buttons) {
    button.addEventListener("pointerenter", event => {
      if (event.pointerType === "mouse") display(button);
    });
    button.addEventListener("focus", () => {
      if (button.matches(":focus-visible")) display(button);
    });
    button.addEventListener("click", () => {
      select(selected === button ? null : button);
      display(selected);
    });
  }
  trailer?.addEventListener("click", () => {
    select(null);
    display(null, true);
  });
  thumbs.addEventListener("pointerleave", event => {
    if (event.pointerType === "mouse") display(selected);
  });
  thumbs.addEventListener("focusout", event => {
    if (!thumbs.contains(event.relatedTarget)) display(selected);
  });

  if (collection && collectionDialog && typeof collectionDialog.showModal === "function") {
    collection.addEventListener("click", () => {
      const featured = collection.querySelector("[data-featured-image]");
      const sources = [
        { src: featured.src, alt: featured.alt },
        ...buttons.map(button => ({ src: button.dataset.previewSrc, alt: button.dataset.previewAlt }))
      ];
      const images = sources.map(({ src, alt }) => {
        const image = document.createElement("img");
        image.src = src;
        image.alt = alt;
        return image;
      });
      collectionDialog.querySelector("#collection-title").textContent = collection.dataset.openCollection;
      collectionDialog.querySelector("[data-collection-images]").replaceChildren(...images);
      collectionDialog.showModal();
      collectionDialog.scrollTop = 0;
    });
  }
}

function formatTime(seconds) {
  const value = Math.max(0, Math.floor(seconds));
  return Math.floor(value / 60) + ":" + String(value % 60).padStart(2, "0");
}

function isBuffered(video, time) {
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= time && time <= video.buffered.end(i)) return true;
  }
  return false;
}

function loadVideoSource(video, source) {
  return new Promise((resolve, reject) => {
    function removeListeners() {
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("error", failed);
    }
    function loaded() {
      removeListeners();
      resolve();
    }
    function failed() {
      removeListeners();
      reject(new Error("Video metadata could not be loaded."));
    }
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("error", failed);
    video.src = source;
  });
}

function enableTimeline(video) {
  const card = video.closest(".animation-clip");
  const toolbar = card.querySelector(".video-toolbar");
  const play = toolbar.querySelector("[data-play]");
  const fullscreen = toolbar.querySelector("[data-fullscreen]");
  const timeline = toolbar.querySelector("input");
  const timeLabel = toolbar.querySelector("[data-time]");
  const status = card.querySelector(".video-status");
  const mediaUrl = video.querySelector("source").src;
  const originalDuration = Number(timeline.max);
  let editing = false;
  let switching = false;
  let requestedTime = null;

  function updateTime(time) {
    const duration = Number.isFinite(video.duration) ? video.duration : originalDuration;
    const elapsed = formatTime(time);
    timeline.max = String(duration);
    timeline.setAttribute("aria-valuetext", elapsed + " of " + formatTime(duration));
    timeLabel.textContent = elapsed + " / " + formatTime(duration);
  }

  function sync() {
    if (!editing && requestedTime === null) {
      timeline.value = String(video.currentTime);
      updateTime(video.currentTime);
    }
    play.textContent = video.paused ? "Play" : "Pause";
  }

  async function seek(time) {
    requestedTime = time;
    if (switching) return;
    status.hidden = true;
    if (!video.src.startsWith("blob:") && !isBuffered(video, time)) {
      // Some hosts return full responses instead of byte ranges. A blob gives
      // the browser local access to the whole clip when jumping ahead.
      switching = true;
      const resume = !video.paused;
      let objectUrl;
      play.disabled = true;
      status.textContent = "Loading the requested position…";
      status.hidden = false;
      video.pause();
      try {
        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error("Could not download the video.");
        objectUrl = URL.createObjectURL(await response.blob());
        await loadVideoSource(video, objectUrl);
        status.hidden = true;
      } catch {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl);
          video.removeAttribute("src");
          video.load();
        }
        status.textContent = "Could not load the requested position. Try again.";
      } finally {
        switching = false;
        play.disabled = false;
        if (resume) video.play().catch(() => {});
      }
    }
    if (video.readyState >= 1) {
      video.currentTime = Math.min(requestedTime, video.duration);
    }
    requestedTime = null;
    sync();
  }

  timeline.addEventListener("input", () => {
    editing = true;
    updateTime(Number(timeline.value));
  });
  timeline.addEventListener("change", () => {
    editing = false;
    void seek(Number(timeline.value));
  });
  timeline.addEventListener("blur", () => { editing = false; });
  play.addEventListener("click", () => {
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
  if (card.requestFullscreen || video.webkitEnterFullscreen) {
    fullscreen.addEventListener("click", () => {
      if (document.fullscreenElement === card) {
        document.exitFullscreen().catch(() => {});
      } else if (card.requestFullscreen) {
        card.requestFullscreen().catch(() => {});
      } else {
        video.webkitEnterFullscreen();
      }
    });
    document.addEventListener("fullscreenchange", () => {
      fullscreen.textContent = document.fullscreenElement === card ? "Exit fullscreen" : "Fullscreen";
    });
  } else {
    fullscreen.hidden = true;
  }
  for (const event of ["loadedmetadata", "timeupdate", "play", "pause", "seeked"]) {
    video.addEventListener(event, sync);
  }
  video.controls = false;
  toolbar.hidden = false;
  sync();
}

for (const video of document.querySelectorAll("[data-scrubbable]")) enableTimeline(video);
