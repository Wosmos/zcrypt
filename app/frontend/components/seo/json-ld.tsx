export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    logo: "https://zcrypt.cloud/favicon.svg",
    description:
      "Free, open-source, zero-knowledge encrypted cloud storage. Your files are encrypted on your device with AES-256-GCM and stored in your own GitHub, GitLab, Hugging Face, or Telegram account — only you can read them.",
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

export function SoftwareApplicationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    applicationCategory: "SecurityApplication",
    operatingSystem: "Web, Windows, macOS, Linux",
    description:
      "Zero-knowledge encrypted cloud storage. Encrypt files with AES-256-GCM on your device and store them in your own GitHub, GitLab, Hugging Face, or Telegram account. Free and open source.",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      name: "Free and open source",
    },
    featureList: [
      "Zero-knowledge encryption",
      "AES-256-GCM encryption",
      "Open source",
      "Bring Your Own Backend (BYOB)",
      "Stored in your own cloud accounts",
      "Terminal app (TUI)",
      "Real-time upload progress",
      "Multi-platform support",
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
    description: "Private, open-source encrypted cloud storage you actually own.",
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
