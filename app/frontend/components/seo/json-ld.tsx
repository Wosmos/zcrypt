export function OrganizationJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "zcrypt",
    url: "https://zcrypt.cloud",
    logo: "https://zcrypt.cloud/favicon.svg",
    description:
      "Free zero-knowledge encrypted cloud storage with military-grade AES-256 encryption. Open source, private, and affordable.",
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
      "Zero-knowledge encrypted cloud storage. Upload, encrypt, and store files with AES-256-GCM encryption. 10 GB free.",
    offers: [
      {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
        name: "Free",
        description: "10 GB encrypted storage, 2 concurrent uploads",
      },
      {
        "@type": "Offer",
        price: "4",
        priceCurrency: "USD",
        name: "Plus",
        description: "200 GB encrypted storage, 5 concurrent uploads",
        priceValidUntil: "2027-12-31",
      },
      {
        "@type": "Offer",
        price: "9",
        priceCurrency: "USD",
        name: "Pro",
        description: "2 TB encrypted storage, unlimited uploads, BYOB",
        priceValidUntil: "2027-12-31",
      },
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "150",
      bestRating: "5",
      worstRating: "1",
    },
    featureList: [
      "Zero-knowledge encryption",
      "AES-256-GCM encryption",
      "Open source",
      "Bring Your Own Backend (BYOB)",
      "Git-based distributed storage",
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
    description: "Private encrypted cloud storage that costs less.",
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
