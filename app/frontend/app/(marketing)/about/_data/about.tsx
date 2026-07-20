import type { ReactNode } from "react";
import { WOSMO } from "@/components/marketing/wosmo";

interface AboutProject {
  name: string;
  blurb: string;
  stack: string;
  href: string;
}

export interface AboutPageData {
  hero: {
    eyebrow: string;
    headlineTop: ReactNode;
    headlineSecondary: ReactNode;
    subtext: ReactNode;
    primaryLabel: string;
    secondaryLabel: string;
  };
  trust: {
    eyebrow: string;
    body: ReactNode;
  };
  origin: {
    heading: string;
    paragraphsBeforeQuote: ReactNode[];
    pullQuote: ReactNode;
    paragraphsAfterQuote: ReactNode[];
    philosophyLinkLabel: string;
  };
  projects: {
    heading: string;
    intro: ReactNode;
    items: AboutProject[];
    portfolioLinkLabel: string;
  };
  stack: {
    heading: string;
    intro: ReactNode;
    items: string[];
  };
  cta: {
    heading: string;
    body: ReactNode;
  };
}

export const about: AboutPageData = {
  hero: {
    eyebrow: "Who's actually behind this",
    headlineTop: <>Hi, I&apos;m Wasif.</>,
    headlineSecondary: <>I just wanted free storage.</>,
    subtext: (
      <>
        {WOSMO.name} &mdash;{" "}
        <span className="font-semibold text-[var(--color-text)]">
          {WOSMO.handle}
        </span>{" "}
        to the internet. A {WOSMO.role.toLowerCase()} in {WOSMO.location} who
        needed somewhere to put a lot of files, couldn&apos;t find storage
        that didn&apos;t also want to read them, and &mdash; instead of
        letting it go like a reasonable person &mdash; spent a few months
        building his own. That&apos;s zcrypt. It&apos;s just me back here: no
        team, no investors, no &ldquo;zcrypt family.&rdquo; Which mostly means
        when something breaks, I already know whose fault it is.
      </>
    ),
    primaryLabel: "View my portfolio",
    secondaryLabel: "GitHub",
  },

  trust: {
    eyebrow: "Why my name is on this",
    body: (
      <>
        A tool that holds your keys should at least tell you who to blame
        &mdash; so, that&apos;s me. Right here. There&apos;s no mysterious
        &ldquo;we&rdquo; to vanish behind when something breaks, no &ldquo;the
        team is looking into it.&rdquo; There is a team. It&apos;s me. The
        encryption runs on your device before anything uploads, so I
        can&apos;t read your files. I&apos;ve tried it on my own test data.
        Can&apos;t. That&apos;s the entire point.
      </>
    ),
  },

  origin: {
    heading: "How zcrypt actually happened",
    paragraphsBeforeQuote: [
      <>
        A couple of months ago I was moving my whole life between machines
        &mdash; 50-something gigabytes of projects, RAW photos, and
        half-finished edits I keep swearing I&apos;ll get back to. The kind of
        files you can&apos;t just re-download.
      </>,
      <>
        Google Drive tapped me on the shoulder at 15GB and asked for my card.
        So I did the very reasonable thing: I made a second account. Then a
        third. For about a week I was splitting one folder across three
        logins like a low-budget digital smuggler, quietly proud of a system
        held together with tape.
      </>,
      <>
        Then I tried TeraBox. &ldquo;One terabyte, free,&rdquo; they said.
        What they didn&apos;t say: the download button is hidden like a state
        secret, your files quietly live on <em>their</em> servers, and the
        fine print treats your data as theirs to scan and learn from. It
        really clicked when I uploaded a 4GB folder, watched it crawl to 80%,
        and watched it fail. My first thought wasn&apos;t &ldquo;let me
        retry.&rdquo; It was &ldquo;why am I handing my entire life to a
        company whose whole business is knowing what&apos;s inside it?&rdquo;
      </>,
      <>
        And here&apos;s the part I genuinely can&apos;t take credit for,
        because it&apos;s just true: free storage was never free. I just
        hadn&apos;t read the price tag &mdash; because the price tag is me.
        These are billion-dollar companies; privacy isn&apos;t a feature they
        forgot to add, it&apos;s the thing they quietly sell against.
      </>,
      <>
        So I stopped complaining online and started building, which is really
        just complaining with extra steps. The idea was simple even though
        the code very much wasn&apos;t: encrypt your files on your device
        before they leave, so not even I can read them, then store them
        across the infrastructure you already own and trust. No new data
        empire. No &ldquo;we value your privacy&rdquo; banner that means the
        exact opposite. Just your files, locked, yours.
      </>,
    ],
    pullQuote: (
      <>
        Free storage was never free. I just hadn&apos;t read the price tag
        &mdash; because the price tag was me.
      </>
    ),
    paragraphsAfterQuote: [
      <>
        I&apos;m building it in public &mdash; the wins, the bugs, and the
        2AM &ldquo;why is this WASM module re-initialising&rdquo; commits.
        It&apos;s me and a concerning amount of coffee, so yes, there will be
        rough edges. The encryption isn&apos;t one of them: it&apos;s open
        source, and I can&apos;t read your files even if I wanted to. (I
        don&apos;t. But I couldn&apos;t.)
      </>,
    ],
    philosophyLinkLabel: "The longer, ranty version lives on the philosophy page",
  },

  projects: {
    heading: "Other things I've built",
    intro: (
      <>
        I have a bad habit of building the whole thing myself &mdash;
        frontend, backend, and the awkward bits in between. A few others that
        (mostly) work:
      </>
    ),
    items: [
      {
        name: "Learnity",
        blurb: "AI-powered learning platform with gamified courses and progress tracking.",
        stack: "Next.js 15 · PostgreSQL · Firebase",
        href: "https://github.com/Wosmos/Learnity",
      },
      {
        name: "DocXO",
        blurb: "Real-time collaborative documents — multiple cursors, live editing, zero lag.",
        stack: "Next.js · Liveblocks · Lexical",
        href: "https://github.com/Wosmos/DocXO",
      },
      {
        name: "Tellow",
        blurb: "Cross-platform video calling app with rooms, chat, and screen share.",
        stack: "React Native · Expo · GetStream",
        href: "https://github.com/Wosmos/Tellow",
      },
      {
        name: "NetLink",
        blurb: "A Go chat backend built to hold thousands of concurrent WebSocket connections.",
        stack: "Go · WebSockets · Concurrency",
        href: "https://github.com/Wosmos/NetLink",
      },
      {
        name: "DevToolsHQ",
        blurb: "A dashboard of everyday developer tools — formatters, converters, generators.",
        stack: "Next.js · TypeScript · Firebase",
        href: "https://github.com/Wosmos/DevToolsHQ",
      },
      {
        name: "ResumeRight",
        blurb: "An AI resume optimizer that scores against ATS checks and rewrites weak lines.",
        stack: "Next.js · AI · TypeScript",
        href: "https://github.com/Wosmos/AI-Resume-checker",
      },
    ],
    portfolioLinkLabel: "See everything on my portfolio",
  },

  stack: {
    heading: "The usual suspects",
    intro: (
      <>
        The tools I reach for, from the browser all the way down to the bytes
        on disk:
      </>
    ),
    items: [
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
    ],
  },

  cta: {
    heading: "Let's build something.",
    body: (
      <>
        I&apos;m open to new projects and freelance work &mdash; and I answer
        my own messages, mostly because there&apos;s no one else to pass them
        to. Pick a door:
      </>
    ),
  },
};
