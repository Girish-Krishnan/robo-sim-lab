export interface LegendSpec {
  lidar: boolean;
  paths: boolean;
  particles: boolean;
  route: boolean;
}

interface LegendRow {
  swatch: string;
  name: string;
  text: string;
}

const ROWS: Record<string, LegendRow> = {
  particles: {
    swatch: "#ff2bd6",
    name: "Particles",
    text: "Each pink dot is one guess of the car's pose: where it is, and which way it faces.",
  },
  ellipse: {
    swatch: "#ffd400",
    name: "Uncertainty",
    text: "The yellow ring is the 2-sigma spread of those guesses. A small ring means the filter is sure.",
  },
  estimate: {
    swatch: "#ff5d73",
    name: "Estimate",
    text: "The red trail is the filter's best pose, moment by moment.",
  },
  truth: {
    swatch: "linear-gradient(90deg, #3f8cc0, #f0c747)",
    name: "True path",
    text: "Where the car actually drove. The color follows speed.",
  },
  odom: {
    swatch: "#6ea8ff",
    name: "Odometry",
    text: "The blue trail is where the wheel sensors think the car went.",
  },
  route: {
    swatch: "#7dcea0",
    name: "Reference path",
    text: "The route the program is steering toward.",
  },
  lidar: {
    swatch: "#8dfff2",
    name: "Lidar",
    text: "Beams from the roof sensor. In the corner inset, amber dots are close hits.",
  },
};

const LEGEND_SEEN = "robo-sim-lab.legend-seen";

/** Compact key for whatever the lesson is drawing. Hidden when nothing applies. */
export function mountLegend(root: HTMLElement): { show: (spec: LegendSpec | null) => void } {
  const list = root.querySelector<HTMLElement>("#legend-list");
  const toggle = root.querySelector<HTMLButtonElement>("#legend-toggle");
  if (!list || !toggle) return { show: () => undefined };
  let open = true;
  const seen = () => {
    try {
      return localStorage.getItem(LEGEND_SEEN) === "1";
    } catch {
      return false;
    }
  };
  const markSeen = () => {
    try {
      localStorage.setItem(LEGEND_SEEN, "1");
    } catch {
      // The key still collapses for this page view.
    }
  };
  const paint = () => {
    root.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Key" : "Key";
    toggle.title = open ? "Fold the color key" : "Open the color key";
  };
  toggle.addEventListener("click", () => {
    open = !open;
    markSeen();
    paint();
  });
  return {
    show(spec) {
      const keys = spec ? activeKeys(spec) : [];
      if (keys.length === 0) {
        root.hidden = true;
        return;
      }
      root.hidden = false;
      open = !seen();
      markSeen();
      paint();
      list.replaceChildren(
        ...keys.map((key) => {
          const row = ROWS[key];
          const item = document.createElement("li");
          const swatch = document.createElement("i");
          swatch.style.background = row?.swatch ?? "#fff";
          const copy = document.createElement("span");
          const name = document.createElement("strong");
          name.textContent = row?.name ?? key;
          copy.append(name, document.createTextNode(` ${row?.text ?? ""}`));
          item.append(swatch, copy);
          return item;
        }),
      );
    },
  };
}

function activeKeys(spec: LegendSpec): string[] {
  const keys: string[] = [];
  if (spec.particles) keys.push("particles", "ellipse", "estimate");
  if (spec.paths) keys.push("truth", "odom");
  if (spec.route) keys.push("route");
  if (spec.lidar) keys.push("lidar");
  return keys;
}
