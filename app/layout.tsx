import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://jujutsu-manga-db.mitsuyasuuu.chatgpt.site"),
  title: "呪術廻戦データベース",
  description: "原作漫画の各話・人物・戦闘・技・用語を相互参照できる呪術廻戦データベース。",
  openGraph: {
    title: "呪術廻戦データベース",
    description: "原作漫画の各話・人物・戦闘・技・用語を相互参照。",
    url: "https://jujutsu-manga-db.mitsuyasuuu.chatgpt.site",
    siteName: "呪術廻戦データベース",
    locale: "ja_JP",
    type: "website",
    images: [{ url: "/og.png", width: 1734, height: 909, alt: "呪術廻戦データベース" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "呪術廻戦データベース",
    description: "原作漫画の各話・人物・戦闘・技・用語を相互参照。",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
