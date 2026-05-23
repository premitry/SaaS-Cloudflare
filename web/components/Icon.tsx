// Minimal inline SVG icons (no external icon dependency).

import type { SVGProps } from "react";

const base = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

type Props = SVGProps<SVGSVGElement> & { size?: number };

function svg(d: string) {
  return function Icon({ size = 16, ...rest }: Props) {
    return (
      <svg {...base} width={size} height={size} {...rest}>
        <path d={d} />
      </svg>
    );
  };
}

export const IconHome = svg("M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z");
export const IconCloud = svg("M7 18a5 5 0 1 1 .9-9.9 6 6 0 0 1 11.6 1.6A4.5 4.5 0 0 1 18 19H7z");
export const IconGlobe = svg("M3 12h18M12 3a14.5 14.5 0 0 1 0 18M12 3a14.5 14.5 0 0 0 0 18M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z");
export const IconUsers = svg("M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM3 21a7 7 0 0 1 14 0M17 7a4 4 0 1 1 4 7");
export const IconList = svg("M4 6h16M4 12h16M4 18h16");
export const IconCog = svg("M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z");
export const IconLogout = svg("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9");
export const IconCopy = svg("M15 4H6a2 2 0 0 0-2 2v12M9 8h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V8z");
export const IconCheck = svg("M5 13l4 4L19 7");
export const IconPlus = svg("M12 5v14M5 12h14");
export const IconTrash = svg("M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6");
export const IconEdit = svg("M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z");
export const IconSearch = svg("M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z");
export const IconRefresh = svg("M21 12a9 9 0 0 1-15.5 6.3M3 12a9 9 0 0 1 15.5-6.3M21 4v6h-6M3 20v-6h6");
export const IconShield = svg("M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z");
export const IconMail = svg("M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z");
export const IconWarn = svg("M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z");
export const IconX = svg("M18 6 6 18M6 6l12 12");
export const IconChevron = svg("M9 18l6-6-6-6");
