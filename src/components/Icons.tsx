import type { SVGProps } from "react";

const base = {
  fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true,
};
type P = SVGProps<SVGSVGElement>;

export const IHome = (p: P) => (<svg {...base} {...p}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20h14V9.5" /><path d="M10 20v-5h4v5" /></svg>);
export const IList = (p: P) => (<svg {...base} {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></svg>);
export const ICalendar = (p: P) => (<svg {...base} {...p}><rect x="3" y="4.5" width="18" height="16" rx="2.5" /><path d="M3 9.5h18M8 3v3M16 3v3" /></svg>);
export const IUsers = (p: P) => (<svg {...base} {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.8.8 3 2.6 3.4 5.2" /></svg>);
export const IUser = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6.5 8-6.5s7.2 2.5 8 6.5" /></svg>);
export const IPlus = (p: P) => (<svg {...base} strokeWidth={2.4} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IBack = (p: P) => (<svg {...base} strokeWidth={2.2} {...p}><path d="m15 5-7 7 7 7" /></svg>);
export const IEdit = (p: P) => (<svg {...base} {...p}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>);
export const IFile = (p: P) => (<svg {...base} {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>);
export const IUpload = (p: P) => (<svg {...base} {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>);
export const ITrash = (p: P) => (<svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IClock = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>);
export const IChevron = (p: P) => (<svg {...base} {...p}><path d="m9 6 6 6-6 6" /></svg>);
export const ICheck = (p: P) => (<svg {...base} strokeWidth={2.6} {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>);
export const IMail = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>);
export const IKey = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M17 6l3 3M14.5 8.5l2 2" /></svg>);
export const IBuilding = (p: P) => (<svg {...base} {...p}><path d="M3 21h18M5 21V10l7-5 7 5v11" /><path d="M9 21v-5h6v5M9 11h.01M15 11h.01" /></svg>);
