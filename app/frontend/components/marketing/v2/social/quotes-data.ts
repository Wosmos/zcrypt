export type SampleQuote = {
  quote: string;
  name: string;
  role: string;
};

const SAMPLE_QUOTES: readonly SampleQuote[] = [
  {
    quote:
      "I had three Google accounts just for storage. Now I have one zcrypt and a Telegram I already used.",
    name: "Hamza R.",
    role: "Student",
  },
  {
    quote:
      "The fact that they literally can't open my files is the whole reason I moved my scans here.",
    name: "Sara K.",
    role: "Freelance designer",
  },
  {
    quote: "Uploaded a 6 GB folder on bad Wi-Fi. It dropped twice and just carried on. That's new.",
    name: "Omar T.",
    role: "Video editor",
  },
  {
    quote:
      "The folder password is my favourite thing about it. My tax stuff has its own little door now.",
    name: "Aisha M.",
    role: "Accountant",
  },
  {
    quote: "I read the code before trusting it. It does what the page says it does.",
    name: "Daniyal F.",
    role: "Backend developer",
  },
  {
    quote:
      "It feels like a normal drive. You only notice the lock when you realise nobody else can get in.",
    name: "Mehwish A.",
    role: "Teacher",
  },
  {
    quote:
      "My phone kept saying storage full. Now it says nothing, which is my favourite thing a phone can say.",
    name: "Zara N.",
    role: "Photographer",
  },
  {
    quote: "I sent my landlord a link that expires in a week. He was confused. I was delighted.",
    name: "Bilal S.",
    role: "Tenant",
  },
  {
    quote:
      "Set it up on my dad's laptop. He asked where the files went. I said somewhere safe. He said that's what he says about his glasses.",
    name: "Hira Q.",
    role: "Daughter",
  },
  {
    quote: "I went looking for the upgrade button out of habit. There isn't one. I checked twice.",
    name: "Usman K.",
    role: "Shop owner",
  },
];

export const QUOTE_ROW_A = SAMPLE_QUOTES.slice(0, 5);
export const QUOTE_ROW_B = SAMPLE_QUOTES.slice(5, 10);
