interface AboutProject {
  name: string;
  key: string;
  stack: string;
  href: string;
}

export const aboutProjects: AboutProject[] = [
  {
    name: "Learnity",
    key: "learnity",
    stack: "Next.js 15 · PostgreSQL · Firebase",
    href: "https://github.com/Wosmos/Learnity",
  },
  {
    name: "DocXO",
    key: "docxo",
    stack: "Next.js · Liveblocks · Lexical",
    href: "https://github.com/Wosmos/DocXO",
  },
  {
    name: "Tellow",
    key: "tellow",
    stack: "React Native · Expo · GetStream",
    href: "https://github.com/Wosmos/Tellow",
  },
  {
    name: "NetLink",
    key: "netlink",
    stack: "Go · WebSockets · Concurrency",
    href: "https://github.com/Wosmos/NetLink",
  },
  {
    name: "DevToolsHQ",
    key: "devtoolshq",
    stack: "Next.js · TypeScript · Firebase",
    href: "https://github.com/Wosmos/DevToolsHQ",
  },
  {
    name: "ResumeRight",
    key: "resumeright",
    stack: "Next.js · AI · TypeScript",
    href: "https://github.com/Wosmos/AI-Resume-checker",
  },
];

export const aboutStack: string[] = [
  "TypeScript",
  "React",
  "Next.js",
  "Go",
  "PostgreSQL",
  "React Native",
  "Flutter",
  "Node.js",
  "Tailwind CSS",
  "AI / LLMs",
];
