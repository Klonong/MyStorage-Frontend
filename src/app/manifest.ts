import type { MetadataRoute } from "next";

/** Lets handhelds install the scanner to the home screen; it opens straight into /scanner. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MyStorage Scanner",
    short_name: "Scanner",
    description: "Receive, put away, pick and load pallets by scan.",
    start_url: "/scanner",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#2563eb",
    icons: [
      { src: "/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Full-bleed artwork, so the same file is safe to crop as a maskable icon.
      { src: "/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
