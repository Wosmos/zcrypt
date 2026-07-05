export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    logo: "https://zcrypt.cloud/favicon.svg",
    description:
      "Free, open-source, zero-knowledge encrypted cloud drive. Organize files in real folders, preview them in the browser, and lock individual folders with their own passwords — all encrypted on your device with AES-256-GCM and stored in your own GitHub, GitLab, Hugging Face, or Telegram account. Only you can read them.",
    foundingDate: "2025",
    sameAs: [
      "https://github.com/zcrypt",
    ],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      url: "https://zcrypt.cloud/docs",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// Structured data for the maker behind zcrypt — powers rich results for
// "who built zcrypt" and links the founder's verified profiles (sameAs).
export function PersonJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: "Wasif Malik",
    alternateName: "Wosmo",
    url: "https://wosmos.vercel.app",
    jobTitle: "Full-stack engineer",
    email: "mailto:m.wasifmalik17@gmail.com",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Karachi",
      addressCountry: "PK",
    },
    knowsAbout: [
      "Cryptography",
      "Zero-knowledge systems",
      "Go",
      "Next.js",
      "React",
      "PostgreSQL",
      "Distributed systems",
    ],
    sameAs: [
      "https://github.com/Wosmos",
      "https://www.linkedin.com/in/wasif-m-79205a1bb/",
      "https://www.instagram.com/wosmo_tech/",
      "https://hashnode.com/@Wosmo",
    ],
    mainEntityOfPage: "https://zcrypt.cloud/about",
    worksFor: {
      "@type": "Organization",
      name: "zcrypt",
      url: "https://zcrypt.cloud",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function SoftwareApplicationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Web, Windows, macOS, Linux",
    description:
      "A zero-knowledge encrypted cloud drive with real folders, in-browser file previews, and per-folder passwords. Files are encrypted with AES-256-GCM on your device and stored in your own GitHub, GitLab, Hugging Face, or Telegram account. Free and open source.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "Free and open source",
    },
    featureList: [
      "Zero-knowledge encryption",
      "AES-256-GCM encryption",
      "Real folders and a file explorer",
      "Encrypted folder names",
      "Per-folder password protection",
      "In-browser previews for images, video, audio, PDFs, documents, and code",
      "Trash with restore",
      "Unified transfer manager with pause and resume",
      "Encrypted file sharing with expiring links",
      "Bring Your Own Backend (BYOB)",
      "Stored in your own cloud accounts",
      "Open source",
      "Terminal app (TUI)",
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function WebSiteJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    description: "The private, open-source encrypted cloud drive you actually own.",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://zcrypt.cloud/docs?q={search_term_string}",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function FAQJsonLd({
  faqs,
}: {
  faqs: { q: string; a: string }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function TUIApplicationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "zcrypt TUI",
    url: "https://zcrypt.cloud/tui",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    description:
      "Terminal interface for zcrypt encrypted cloud storage. Upload, download, and manage your zero-knowledge encrypted vault from the command line with vim-style navigation.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "Free",
      description:
        "Free and open source terminal client for zcrypt encrypted storage",
    },
    featureList: [
      "Vim-style keyboard navigation",
      "Real-time upload and download progress",
      "AES-256-GCM client-side encryption",
      "Zstd compression",
      "TOTP two-factor authentication",
      "Bulk file operations",
      "Command mode with ex-style commands",
      "Four performance profiles",
      "SSH-friendly headless operation",
      "Single binary with zero dependencies",
    ],
    softwareRequirements: "Go 1.25 or later",
    downloadUrl: "https://github.com/zcrypt/zcrypt-tui",
    installUrl: "https://zcrypt.cloud/tui#install",
    releaseNotes: "https://github.com/zcrypt/zcrypt-tui/releases",
    programmingLanguage: "Go",
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export function BreadcrumbJsonLd({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

// Structured data for a documentation / how-to page.
export function TechArticleJsonLd({
  headline,
  description,
  url,
  section,
  datePublished = "2026-01-01",
  dateModified = "2026-06-27",
}: {
  headline: string;
  description: string;
  url: string;
  section?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline,
    description,
    url,
    ...(section ? { articleSection: section } : {}),
    datePublished,
    dateModified,
    inLanguage: "en",
    isPartOf: {
      "@type": "WebSite",
      name: "zcrypt",
      url: "https://zcrypt.cloud",
    },
    author: {
      "@type": "Organization",
      name: "zcrypt",
      url: "https://zcrypt.cloud",
    },
    publisher: {
      "@type": "Organization",
      name: "zcrypt",
      url: "https://zcrypt.cloud",
      logo: {
        "@type": "ImageObject",
        url: "https://zcrypt.cloud/favicon.svg",
      },
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
