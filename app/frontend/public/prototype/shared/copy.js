// The approved "Price Tag" copy. All four prototypes read from here so the
// words are identical and only the art direction differs.

export const COPY = {
  brand: "zcrypt",
  nav: [
    { label: "Docs", href: "#" },
    { label: "Philosophy", href: "#" },
  ],
  hero: {
    h1: "Free cloud storage that cannot read your files.",
    sub: "Your files are sealed on your device before a byte leaves it. What we store is unreadable to everyone, including us. Free, with no card and no catch you have not been told about.",
    byline: "Wasif, Karachi. Built this after losing a 4 GB upload at 80 percent.",
    cta: "Start free, no card",
    cta2: "Watch it encrypt",
    cta3: "Look around first, no signup",
    trust: ["No card, ever", "Open source", "AES-256-GCM on your device"],
  },
  story: {
    kicker: "Why this exists",
    h2: "Free storage was never free.",
    beats: [
      {
        n: "01",
        t: "I ran out of room",
        p: "Drive gave me 15 GB. I made three accounts and shuffled files between them like a low-budget digital smuggler.",
      },
      {
        n: "02",
        t: "The free terabyte had a catch",
        p: "TeraBox offered a terabyte for nothing. The nothing turned out to be my photos, indexed, and an app that would not let go.",
      },
      {
        n: "03",
        t: "Then it failed at 80 percent",
        p: "A 4 GB upload, fifty minutes in, died at 80 percent. No resume. Start again. I closed the laptop instead.",
      },
      {
        n: "04",
        t: "The price tag was me",
        p: "Every free plan was paid for with the contents of my files. So I built the one that cannot read them.",
      },
    ],
  },
  eighty: {
    kicker: "Nothing below is a mock-up",
    h2: "The same 4 GB upload, twice.",
    leftTitle: "The free cloud I was using",
    rightTitle: "The same file here",
    file: "4 GB of photos",
    leftSize: "4.00 GB",
    rightSize: "4.00 GB, sealed on your device",
    leftDead: "Upload failed. Start again.",
    leftNote: "Four gigabytes. Fifty minutes. Nothing saved.",
    dropped: "Connection dropped",
    done: "Sealed and stored. Nothing to redo.",
    rightNote: "Dropped at chunk five. Carried on from chunk five.",
  },
  pipeline: {
    kicker: "What actually happens",
    h2: "Your file never travels whole.",
    steps: [
      ["Locked on your device.", "Sealed with a key only you hold, before a byte leaves."],
      ["Split into pieces.", "Cut into pieces. No piece means anything alone."],
      ["Stored in accounts you own.", "We hold a map, never the contents."],
    ],
    hint: "Scroll to drive it. Scroll back to undo it.",
  },
  files: [
    ["passport-scan.pdf", "2.4 MB"],
    ["tax-return-2025.pdf", "880 KB"],
    ["wedding-photos.zip", "1.2 GB"],
    ["lease-signed.pdf", "310 KB"],
    ["savings.xlsx", "44 KB"],
  ],
  features: {
    kicker: "What you get",
    h2: "Boring on purpose, where it counts.",
    items: [
      {
        key: "lock",
        t: "Locked before it leaves",
        p: "Sealed on your device. What travels is unreadable to everyone, including us.",
      },
      {
        key: "split",
        t: "Split into pieces",
        p: "Cut into pieces before storage. No single piece means anything on its own.",
      },
      {
        key: "key",
        t: "Only you hold the key",
        p: "Derived from your passphrase, stored nowhere. Not on your device, not on ours.",
      },
      {
        key: "resume",
        t: "Picks up where it dropped",
        p: "Drop the connection at 80 percent and it carries on from 80 percent.",
      },
      {
        key: "own",
        t: "Stored where you already are",
        p: "Your pieces live in accounts you own. If zcrypt vanished, your files would not.",
      },
      {
        key: "open",
        t: "Nothing to trust, only to check",
        p: "The code is open and the ciphertext is on this page. Never take my word for it.",
      },
    ],
  },
  cipher: {
    kicker: "Try it",
    h2: "Watch it encrypt.",
    label: "Type anything. It stays on your machine.",
    sample: "My passport number is not your business.",
    outLabel: "All we would ever hold",
    foot: "Real AES-256-GCM, run in this tab. The key was made here and goes nowhere.",
    failed:
      "Your browser blocked the encryption API, so there is nothing real to show here. That is the correct outcome: we would rather show nothing than fake it.",
  },
  plug: {
    kicker: "Nothing to plug in",
    h2: "Six of our last eight uploaders never connected anything.",
    a: {
      t: "Default",
      p: "Sign up, upload. Shared storage, capped at 1 GB, sealed exactly the same way.",
    },
    b: {
      t: "Your own accounts",
      p: "Connect GitHub, GitLab, Hugging Face or Telegram and the cap goes away. Unlimited, on storage that is yours.",
    },
  },
  price: {
    kicker: "The price",
    strikes: ["No card", "No trial", "No upsell"],
    p: "There is no paid plan to grow into. Storage on your own accounts costs nothing, so neither does this.",
  },
  catch: {
    kicker: "The catch",
    h2: "Read this before you trust it.",
    items: [
      ["Forget your passphrase and your files are gone.", "We cannot reset it. We never had it."],
      ["Shared storage is capped at 1 GB.", "Connect your own account and it is unlimited."],
      ["There is a team. It is Wasif.", "One person, in Karachi, building this in the evenings."],
      ["It is young. Keep a copy.", "Zero-knowledge is not a backup strategy. Yet."],
    ],
  },
  close: {
    h2: "Free. Sealed. Yours.",
    p: "No card, no trial, and nothing to read on our side.",
  },
  footer: {
    line: "Made in Karachi. Open source.",
    links: ["Docs", "Philosophy", "Privacy", "Terms"],
  },
};
