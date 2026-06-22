const SHELL_CLASS = "orbit-content-video-shell";
const CONTROL_CLASS = "orbit-content-video-control";
const THEATER_CLASS = "orbit-content-video-theater";
const THEATER_STAGE_CLASS = "orbit-content-video-theater-stage";

const EXPAND_ICON = `
  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
  <path d="M9 3v18"></path>
  <path d="m13 9 3 3-3 3"></path>
`;

const COLLAPSE_ICON = `
  <rect width="18" height="18" x="3" y="3" rx="2"></rect>
  <path d="M9 3v18"></path>
  <path d="m16 15-3-3 3-3"></path>
`;

interface TheaterBinding {
  shell: HTMLElement;
  expandButton: HTMLButtonElement;
  theaterRoot: HTMLElement | null;
  collapseButton: HTMLButtonElement | null;
  savedVideoStyle: string;
  onKeyDown: ((event: KeyboardEvent) => void) | null;
  prevBodyOverflow: string;
}

const bindings = new WeakMap<HTMLVideoElement, TheaterBinding>();

function createIconSvg(markup: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("class", "w-5 h-5");
  svg.innerHTML = markup;
  return svg;
}

function createControlButton(
  iconMarkup: string,
  title: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = CONTROL_CLASS;
  button.title = title;
  button.setAttribute("aria-label", title);
  button.appendChild(createIconSvg(iconMarkup));
  return button;
}

function ensureVideoShell(video: HTMLVideoElement): HTMLElement {
  const parent = video.parentElement;
  if (parent?.classList.contains(SHELL_CLASS)) {
    return parent;
  }

  const shell = document.createElement("div");
  shell.className = SHELL_CLASS;
  parent?.insertBefore(shell, video);
  shell.appendChild(video);
  return shell;
}

function enterTheater(video: HTMLVideoElement): void {
  const binding = bindings.get(video);
  if (!binding || binding.theaterRoot) return;

  binding.savedVideoStyle = video.getAttribute("style") ?? "";
  binding.prevBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";

  const theaterRoot = document.createElement("div");
  theaterRoot.className = THEATER_CLASS;

  const stage = document.createElement("div");
  stage.className = THEATER_STAGE_CLASS;
  theaterRoot.appendChild(stage);

  const collapseButton = createControlButton(COLLAPSE_ICON, "退出全屏 (Esc)");
  collapseButton.addEventListener("click", () => exitTheater(video));
  theaterRoot.appendChild(collapseButton);

  document.body.appendChild(theaterRoot);
  stage.appendChild(video);

  binding.theaterRoot = theaterRoot;
  binding.collapseButton = collapseButton;
  binding.expandButton.hidden = true;

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      exitTheater(video);
    }
  };
  binding.onKeyDown = onKeyDown;
  window.addEventListener("keydown", onKeyDown);
}

export function exitEmbeddedVideoTheater(video: HTMLVideoElement): void {
  exitTheater(video);
}

function exitTheater(video: HTMLVideoElement): void {
  const binding = bindings.get(video);
  if (!binding || !binding.theaterRoot) return;

  if (binding.onKeyDown) {
    window.removeEventListener("keydown", binding.onKeyDown);
    binding.onKeyDown = null;
  }

  binding.shell.insertBefore(video, binding.expandButton);
  binding.theaterRoot.remove();
  binding.theaterRoot = null;
  binding.collapseButton = null;
  binding.expandButton.hidden = false;

  if (binding.savedVideoStyle) {
    video.setAttribute("style", binding.savedVideoStyle);
  } else {
    video.removeAttribute("style");
  }

  document.body.style.overflow = binding.prevBodyOverflow;
}

export function bindEmbeddedVideoTheater(video: HTMLVideoElement): void {
  if (video.dataset.orbitVideoTheaterBound === "1") return;

  const shell = ensureVideoShell(video);
  const expandButton = createControlButton(EXPAND_ICON, "全屏播放");
  expandButton.addEventListener("click", () => enterTheater(video));
  shell.appendChild(expandButton);

  if (!video.hasAttribute("controlsList")) {
    video.setAttribute("controlslist", "nofullscreen");
  }

  bindings.set(video, {
    shell,
    expandButton,
    theaterRoot: null,
    collapseButton: null,
    savedVideoStyle: video.getAttribute("style") ?? "",
    onKeyDown: null,
    prevBodyOverflow: "",
  });

  video.dataset.orbitVideoTheaterBound = "1";
}

export function destroyEmbeddedVideoTheater(video: HTMLVideoElement): void {
  exitTheater(video);
  bindings.delete(video);
  delete video.dataset.orbitVideoTheaterBound;
}
