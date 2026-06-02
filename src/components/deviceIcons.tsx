import type { ReactNode } from "react";

// Brand marks authored in a 24×24 box, filled with currentColor. Placed inside a
// device frame via a nested <g transform>. `cx`/`cy` are the desired center in
// the parent 20×20 viewBox; `size` is the rendered width/height in those units.
const APPLE =
  "M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.04.28.04.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z";

const ANDROID =
  "M6 18c0 .55.45 1 1 1h1v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h2v3.5c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5V19h1c.55 0 1-.45 1-1V8H6v10zM3.5 8C2.67 8 2 8.67 2 9.5v7c0 .83.67 1.5 1.5 1.5S5 17.33 5 16.5v-7C5 8.67 4.33 8 3.5 8zm17 0c-.83 0-1.5.67-1.5 1.5v7c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5v-7c0-.83-.67-1.5-1.5-1.5zm-4.97-5.84l1.3-1.3c.2-.2.2-.51 0-.71-.2-.2-.51-.2-.71 0l-1.48 1.48C13.85 1.23 12.95 1 12 1c-.96 0-1.86.23-2.66.63L7.85.15c-.2-.2-.51-.2-.71 0-.2.2-.2.51 0 .71l1.31 1.31C6.97 3.26 6 5.01 6 7h12c0-1.99-.97-3.75-2.47-4.84zM10 5H9V4h1v1zm5 0h-1V4h1v1z";

function Mark({ d, cx, cy, size }: { d: string; cx: number; cy: number; size: number }) {
  const scale = size / 24;
  const tx = cx - 12 * scale;
  const ty = cy - 12 * scale;
  return (
    <g transform={`translate(${tx} ${ty}) scale(${scale})`} fill="currentColor" stroke="none">
      <path d={d} />
    </g>
  );
}

const svgProps = {
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  className: "w-full h-full",
} as const;

/** Canonical device-icon glyphs: a device frame with the platform's brand logo
 *  inside the screen. Shared by the SIMS launcher row and the dock-area per-item
 *  device icons so both stay in sync. */
export const DEVICE_GLYPHS: Record<string, ReactNode> = {
  iphone: (
    <svg {...svgProps}>
      <rect x="5" y="1" width="10" height="18" rx="2" />
      <Mark d={APPLE} cx={10} cy={10} size={6} />
    </svg>
  ),
  ipad: (
    <svg {...svgProps}>
      <rect x="1" y="3.5" width="18" height="13" rx="1" />
      <Mark d={APPLE} cx={10} cy={10} size={7} />
    </svg>
  ),
  androidphone: (
    <svg {...svgProps}>
      <rect x="5" y="1" width="10" height="18" rx="2" />
      <Mark d={ANDROID} cx={10} cy={10} size={7} />
    </svg>
  ),
  androidtablet: (
    <svg {...svgProps}>
      <rect x="1" y="3.5" width="18" height="13" rx="1" />
      <Mark d={ANDROID} cx={10} cy={10} size={8} />
    </svg>
  ),
  watch: (
    <svg {...svgProps}>
      <rect x="6" y="4" width="8" height="12" rx="2.5" />
      <Mark d={APPLE} cx={10} cy={10} size={4.5} />
    </svg>
  ),
  windows: (
    <svg {...svgProps}>
      <path d="M2 2h7v7H2zM11 2h7v7h-7zM2 11h7v7H2zM11 11h7v7h-7z" />
    </svg>
  ),
  macos: (
    <svg {...svgProps}>
      <Mark d={APPLE} cx={10} cy={10} size={15} />
    </svg>
  ),
  linux: (
    <svg {...svgProps}>
      <path d="M10 2C7 2 5 4.5 5 7.5c0 1.5.5 2.5 1.5 3.5L5 14c0 0 1.5 2 5 2s5-2 5-2l-1.5-3c1-1 1.5-2 1.5-3.5C15 4.5 13 2 10 2z" />
    </svg>
  ),
};
