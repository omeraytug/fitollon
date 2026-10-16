import type { MetadataRoute } from "next";

// Lets the phone install Fitollon as an app (Share → Add to Home Screen): own icon, full screen, no browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Fitollon",
    short_name: "Fitollon",
    description: "Your health and fitness data in one place, with an AI coach that already knows it.",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#fcfcfb",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
