import type { IconName } from "./nav";

const paths: Record<IconName, string> = {
  home: "M3 11.5 12 4l9 7.5M5 10v10h14V10",
  cart: "M3 4h2l2.4 11h10.2L20 7H6.2M9 20h.01M17 20h.01",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7M7 19h.01M17 19h.01",
  inbox: "M3 13l3-8h12l3 8v6H3zM3 13h5l1 2h6l1-2h5",
  users:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M18 14c2 .5 3 2.5 3 5",
  badge:
    "M12 3l2.5 2 3.2-.2.9 3.1 2.6 1.9-1 3 1 3-2.6 1.9-.9 3.1-3.2-.2L12 21l-2.5-2-3.2.2-.9-3.1L2.8 14l1-3-1-3 2.6-1.9.9-3.1L9.5 3zM9 12l2 2 4-4",
  box: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9",
  tag: "M3 12V4h8l10 10-8 8zM7.5 8h.01",
  globe:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
  factory: "M3 21V10l6 3V10l6 3V6h6v15zM7 17h.01M12 17h.01M17 17h.01",
  layers: "M12 3 3 8l9 5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5",
  book: "M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  chart: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z",
};
export function Icon({
  name,
  className = "size-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[name]} />
    </svg>
  );
}
