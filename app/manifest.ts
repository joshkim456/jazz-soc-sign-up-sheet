import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Jam",
    short_name: "Jam",
    start_url: "/",
    display: "standalone",
    background_color: "#14110f",
    theme_color: "#14110f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
