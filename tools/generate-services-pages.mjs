#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const TEMPLATES_DIR = path.join(ROOT, "dist", "_templates");
const SERVICES_DIR = path.join(ROOT, "dist", "services");
const BASE_PATH = "../";

const REQUIRED_KEYS = [
  "slug",
  "category",
  "title",
  "hero_heading",
  "hero_copy",
  "hero_image_url",
  "core_capabilities",
  "safety_care_points",
  "execution_points"
];

const TAXONOMY = [
  {
    category: "Fleet Services",
    services: [
      ["fleet-management", "Fleet Management", "Manage trucks, trailers, and assets from one operational command center."],
      ["truck-tracking", "Truck Tracking", "Track every truck in motion with live location, ETA, and delay context."],
      ["trailer-tracking", "Trailer Tracking", "Monitor trailer position, utilization, and dwell in real time."],
      ["asset-tracking", "Asset Tracking", "Protect high-value equipment with precise movement and status visibility."]
    ]
  },
  {
    category: "Dispatch & Routing",
    services: [
      ["dispatch-management", "Dispatch Management", "Coordinate drivers, loads, and exceptions with less manual effort."],
      ["smart-routing", "Smart Routing", "Create safer, faster routes using live operating conditions."],
      ["route-optimization", "Route Optimization", "Reduce empty miles and improve margin with dynamic route optimization."],
      ["load-planning", "Load Planning", "Plan loads with capacity, timing, and service reliability in mind."]
    ]
  },
  {
    category: "Driver Services",
    services: [
      ["eld-devices", "ELD Devices", "Keep compliance and hours tracking accurate with connected ELD workflows."],
      ["ai-dashcams", "AI DashCams", "Detect risky behaviors early and accelerate incident response."],
      ["driver-monitoring", "Driver Monitoring", "Support drivers with coaching-led monitoring and wellbeing visibility."],
      ["safety-solutions", "Safety Solutions", "Unify policy, incident handling, and prevention into one safety system."]
    ]
  },
  {
    category: "Analytics & Reporting",
    services: [
      ["report-generation", "Report Generation", "Generate clear operational reports without spreadsheet bottlenecks."],
      ["fleet-analytics", "Fleet Analytics", "Turn transport data into lane, cost, and reliability improvements."],
      ["performance-metrics", "Performance Metrics", "Track service, cost, and safety KPIs in one governance model."],
      ["compliance-reports", "Compliance Reports", "Stay audit-ready with automated compliance reporting workflows."]
    ]
  },
  {
    category: "Alerts & Notifications",
    services: [
      ["fuel-alerts", "Fuel Alerts", "Detect fuel anomalies quickly to control cost and operational risk."],
      ["rest-food-alerts", "Rest/Food Alerts", "Support driver wellbeing with proactive rest and nutrition reminders."],
      ["maintenance-alerts", "Maintenance Alerts", "Prevent breakdowns with maintenance events surfaced early."],
      ["safety-alerts", "Safety Alerts", "Escalate safety events immediately with clear response ownership."]
    ]
  },
  {
    category: "Integrations",
    services: [
      ["third-party-trucks", "Third-party Trucks", "Unify partner fleets into the same operational visibility layer."],
      ["oem-devices", "OEM Devices", "Bring OEM data streams into TTMS without fragmented tooling."],
      ["telematics", "Telematics", "Normalize telematics across mixed hardware for better decisions."],
      ["api-access", "API Access", "Integrate TTMS with external systems through secure, reliable APIs."]
    ]
  }
];

const METRIC_ICONS = ["truck", "road", "chart-line", "shield-alt"];
const EXECUTION_STEPS = ["Plan", "Execute", "Improve"];
const ABOUT_THEME_IMAGE_IDS = [
  "photo-1601584115197-04ecc0da31d7",
  "photo-1586528116311-ad8dd3c8310d",
  "photo-1519003722824-194d4455a60c",
  "photo-1558618666-fcd25c85f82e",
  "photo-1544620347-c4fd4a3d5957",
  "photo-1581092160562-40aa08e78837",
  "photo-1580674285054-bed31e145f59"
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function replaceTokens(template, tokenMap) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokenMap, key) ? tokenMap[key] : match
  );
}

function hashString(input) {
  let hash = 0;
  const text = String(input);
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function parseSize(size) {
  const [w, h] = String(size).split("x");
  return { width: Number(w) || 1200, height: Number(h) || 800 };
}

function buildUnsplashImage(seed, size = "1200x800") {
  const { width, height } = parseSize(size);
  const imageId = ABOUT_THEME_IMAGE_IDS[hashString(seed) % ABOUT_THEME_IMAGE_IDS.length];
  return `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=${width}&h=${height}&q=80`;
}

function resolveThemeImage(url, seed, size = "1200x800") {
  if (!url) {
    return buildUnsplashImage(seed, size);
  }

  if (url.includes("source.unsplash.com")) {
    return buildUnsplashImage(seed, size);
  }

  if (url.includes("images.unsplash.com")) {
    if (/([?&])auto=format/.test(url) && /([?&])fit=crop/.test(url) && /([?&])w=/.test(url) && /([?&])h=/.test(url)) {
      return url;
    }
    const { width, height } = parseSize(size);
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}auto=format&fit=crop&w=${width}&h=${height}&q=80`;
  }

  return url;
}

function getServiceOrder() {
  return TAXONOMY.flatMap((group) =>
    group.services.map(([slug, title]) => ({ slug, title, category: group.category }))
  );
}

function validateRecord(record, expected) {
  for (const key of REQUIRED_KEYS) {
    if (!(key in record)) {
      throw new Error(`Missing required key \"${key}\" for slug \"${record.slug}\"`);
    }
  }

  if (record.category !== expected.category) {
    throw new Error(`Category mismatch for \"${record.slug}\": expected \"${expected.category}\", got \"${record.category}\"`);
  }

  if (!Array.isArray(record.core_capabilities) || record.core_capabilities.length < 4) {
    throw new Error(`\"core_capabilities\" must contain at least 4 items for \"${record.slug}\"`);
  }

  if (!Array.isArray(record.safety_care_points) || record.safety_care_points.length < 3) {
    throw new Error(`\"safety_care_points\" must contain at least 3 items for \"${record.slug}\"`);
  }

  if (!Array.isArray(record.execution_points) || record.execution_points.length < 3) {
    throw new Error(`\"execution_points\" must contain at least 3 items for \"${record.slug}\"`);
  }
}

function renderKpiCards(metrics) {
  const colClass = metrics.length >= 4 ? "col-lg-3 col-md-3 col-sm-6 col-6" : "col-lg-4 col-md-4 col-sm-6 col-6";
  return metrics
    .map((metric, index) => `
                <div class="${colClass} mb-20">
                    <div class="card-f d-flex items-center xl-items-start flex-col wow fadeInUp">
                        <div class="card-f-heading mb-32 md-mb-16 xs-mb-12">
                            <button class="btn btn-ic-primary btn-rounded bg-primary-200 text-primary pointer-events-none btn-ic"><i class="fas fa-${METRIC_ICONS[index % METRIC_ICONS.length]}"></i></button>
                        </div>
                        <div class="card-f-body">
                            <h4 class="counter">${escapeHtml(metric.value)}</h4>
                            <p class="text-gray mb-0">${escapeHtml(metric.label)}</p>
                        </div>
                    </div>
                </div>`)
    .join("\n");
}

function renderCList(items) {
  return items
    .map((item) => `
                            <li>
                                <img src="${BASE_PATH}assets/images/icons/checkmark-green-plain.svg" alt="">
                                <span class="text-gray">${escapeHtml(item)}</span>
                            </li>`)
    .join("\n");
}

function renderArticleCards(items) {
  return items
    .map((item) => `
            <div class="col col-lg-4 col-md-6 col-12">
                <div class="card card-article card-article-about wow fadeInUp">
                    <div class="card-article-heading">
                        <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy">
                    </div>
                    <div class="card-article-body">
                        <label class="category">${escapeHtml(item.category)}</label>
                        <h3 class="title">${escapeHtml(item.title)}</h3>
                        <p class="text-gray mt-8 mb-0">${escapeHtml(item.copy)}</p>
                    </div>
                </div>
            </div>`)
    .join("\n");
}

function buildDefaultHardware(record) {
  return [
    {
      category: "ELD DEVICES",
      title: "Connected ELD Compliance",
      copy: `${record.title} stays compliant with real-time ELD logs, HOS visibility, and inspection-ready records.`,
      image_url: buildUnsplashImage(`${record.title} american truck eld device cabin`)
    },
    {
      category: "AI DASHCAM",
      title: "Proactive Driver Safety",
      copy: "AI DashCam events help teams coach better, reduce risk, and respond faster to road incidents.",
      image_url: buildUnsplashImage(`${record.title} ai dashcam truck road safety`)
    },
    {
      category: "GPS ANTI-THEFT",
      title: "Asset Protection Visibility",
      copy: "GPS anti-theft tracking surfaces unauthorized movement quickly and protects owner assets.",
      image_url: buildUnsplashImage(`${record.title} gps anti theft truck fleet tracking`)
    }
  ];
}

function buildExecutionArticles(record) {
  return EXECUTION_STEPS.map((step, index) => ({
    category: "SERVICE EXECUTION",
    title: step,
    copy: record.execution_points[index] || record.execution_points[record.execution_points.length - 1],
    image_url: buildUnsplashImage(`${record.title} ${step} transport operations`) 
  }));
}

function buildDefaultAuditPoints(record) {
  return [
    `${record.title} events are captured with timestamps and operational context for cleaner audit trails.`,
    "ELD, AI DashCam, and GPS records support compliance reporting without fragmented manual collection.",
    "Owners can review KPI, exception, and safety logs in one TTMS - Total Transport Management System workflow.",
    "Teams generate regulator-ready and customer-facing reports with accurate, centralized data."
  ];
}

function buildGalleryArticles(record) {
  const galleryImages = Array.isArray(record.gallery_image_urls) && record.gallery_image_urls.length
    ? record.gallery_image_urls
    : [
        record.hero_image_url,
        record.operations_image_url || buildUnsplashImage(`${record.title} fleet dispatch operations`),
        buildUnsplashImage(`${record.title} american trucking team`)
      ];

  return galleryImages.slice(0, 3).map((image, index) => ({
    category: "SERVICE GALLERY",
    title: `${record.title} Visual ${index + 1}`,
    copy: "Real transport operations aligned with TTMS service workflows.",
    image_url: resolveThemeImage(image, `${record.slug}-gallery-${index + 1}`)
  }));
}

function buildServiceSections(record, bodyTemplate) {
  const kpis = Array.isArray(record.kpi_metrics) && record.kpi_metrics.length
    ? record.kpi_metrics
    : [
        { value: "96%", label: "Operational consistency" },
        { value: "24/7", label: "Live transport visibility" },
        { value: "28%", label: "Faster issue response" }
      ];

  const coreCapabilities = record.core_capabilities.slice(0, 6);
  const safetyPoints = record.safety_care_points.slice(0, 6);
  const hardwareArticles = Array.isArray(record.hardware_highlights) && record.hardware_highlights.length
    ? record.hardware_highlights
    : buildDefaultHardware(record);
  const executionArticles = buildExecutionArticles(record);
  const auditPoints = Array.isArray(record.audit_report_points) && record.audit_report_points.length
    ? record.audit_report_points
    : buildDefaultAuditPoints(record);
  const galleryArticles = buildGalleryArticles(record);

  const opsImage = resolveThemeImage(record.operations_image_url || record.hero_image_url, `${record.slug}-ops`);
  const secondaryImage = resolveThemeImage(record.secondary_image_url, `${record.slug}-secondary`);
  const careImage = resolveThemeImage(record.care_image_url, `${record.slug}-care`);
  const auditImage = resolveThemeImage(record.audit_image_url, `${record.slug}-audit`);
  const auditSecondaryImage = resolveThemeImage(record.audit_secondary_image_url, `${record.slug}-audit-secondary`);

  return replaceTokens(bodyTemplate, {
    BASE_PATH,
    SERVICE_TITLE: escapeHtml(record.title),
    KPI_CARDS: renderKpiCards(kpis),
    OPS_IMAGE_URL: escapeHtml(opsImage),
    SECONDARY_IMAGE_URL: escapeHtml(secondaryImage),
    CORE_CAPABILITY_LIST: renderCList(coreCapabilities),
    CARE_IMAGE_URL: escapeHtml(careImage),
    SAFETY_POINTS: renderCList(safetyPoints),
    HARDWARE_ARTICLES: renderArticleCards(hardwareArticles),
    EXECUTION_ARTICLES: renderArticleCards(executionArticles),
    AUDIT_IMAGE_URL: escapeHtml(auditImage),
    AUDIT_SECONDARY_IMAGE_URL: escapeHtml(auditSecondaryImage),
    AUDIT_POINTS_LIST: renderCList(auditPoints),
    GALLERY_ARTICLES: renderArticleCards(galleryArticles),
    CTA_COPY: escapeHtml(record.cta_copy || "Bring this TTMS service live with workflows designed for safe, reliable transport execution.")
  });
}

function renderCategoryCards(contentBySlug) {
  return TAXONOMY.map((group) => {
    const cards = group.services
      .map(([slug, title, fallbackSummary]) => {
        const content = contentBySlug.get(slug);
        const summary = content?.hero_copy || fallbackSummary;

        return `
            <div class="col col-lg-4 col-md-6 col-12">
                <div class="card card-article card-article-about wow fadeInUp">
                    <div class="card-article-heading">
                        <img src="${escapeHtml(resolveThemeImage(content?.hero_image_url, `${slug}-catalog`, "1200x800"))}" alt="${escapeHtml(title)}" loading="lazy">
                    </div>
                    <div class="card-article-body">
                        <label class="category">${escapeHtml(group.category)}</label>
                        <h3 class="title">${escapeHtml(title)}</h3>
                        <p class="text-gray mt-8 mb-20">${escapeHtml(summary)}</p>
                        <a class="read-more" href="${BASE_PATH}services/${slug}.html">Open Service <i class="fas fa-arrow-right text-14 ml-8"></i></a>
                    </div>
                </div>
            </div>`;
      })
      .join("\n");

    return `
        <div class="mb-48">
            <div class="heading">
                <h3 class="wow fadeInUp">${escapeHtml(group.category)}</h3>
            </div>
            <div class="row">
${cards}
            </div>
        </div>`;
  }).join("\n");
}

async function main() {
  const [headerTemplate, bodyTemplate, footerTemplate, rawContent] = await Promise.all([
    readFile(path.join(TEMPLATES_DIR, "service-header.html"), "utf8"),
    readFile(path.join(TEMPLATES_DIR, "service-body.html"), "utf8"),
    readFile(path.join(TEMPLATES_DIR, "service-footer.html"), "utf8"),
    readFile(path.join(TEMPLATES_DIR, "services-content.json"), "utf8")
  ]);

  const content = JSON.parse(rawContent);
  const contentBySlug = new Map(content.map((record) => [record.slug, record]));
  const expectedServices = getServiceOrder();

  if (content.length !== expectedServices.length) {
    throw new Error(`Expected ${expectedServices.length} services in services-content.json, found ${content.length}`);
  }

  for (const expected of expectedServices) {
    const record = contentBySlug.get(expected.slug);
    if (!record) {
      throw new Error(`Missing content record for slug \"${expected.slug}\"`);
    }
    validateRecord(record, expected);

    const header = replaceTokens(headerTemplate, {
      BASE_PATH,
      PAGE_TITLE: `${escapeHtml(record.title)} | TTMS Services | TTMS`,
      BODY_CLASS: "landing-about services-page",
      SERVICE_TITLE: escapeHtml(record.title),
      HERO_TAG: escapeHtml(record.hero_tag || record.category),
      HERO_HEADING: escapeHtml(record.hero_heading),
      HERO_COPY: escapeHtml(record.hero_copy),
      HERO_IMAGE_URL: escapeHtml(resolveThemeImage(record.hero_image_url, `${record.slug}-hero`, "1600x900"))
    });

    const body = buildServiceSections(record, bodyTemplate);
    const footer = replaceTokens(footerTemplate, { BASE_PATH });

    await writeFile(path.join(SERVICES_DIR, `${record.slug}.html`), `${header}\n${body}\n${footer}`, "utf8");
  }

  const indexHeader = replaceTokens(headerTemplate, {
    BASE_PATH,
    PAGE_TITLE: "All Services | TTMS | TTMS",
    BODY_CLASS: "landing-about services-page services-index",
    SERVICE_TITLE: "TTMS Service Catalog",
    HERO_TAG: "TTMS SERVICE CATALOG",
    HERO_HEADING: "TTMS - Total Transport Management System Services",
    HERO_COPY:
      "Explore all 24 services across fleet operations, dispatch, driver safety, analytics, alerts, and integrations. Every page follows the same visual language as the about-us theme.",
    HERO_IMAGE_URL: buildUnsplashImage("ttms-service-catalog", "1600x900")
  });

  const indexBody = `
<section class="landing-about-blog pb-80">
    <div class="container">
${renderCategoryCards(contentBySlug)}
    </div>
</section>

<section class="real-estate-signup about-us-newsletter">
    <div class="real-estate-signup-box wow fadeInUp">
        <div class="inner-container text-center">
            <h4>Need help selecting the right TTMS services?</h4>
            <p>We map your dispatch, fleet, safety, and audit workflows to the right implementation plan.</p>
            <div class="mt-24">
                <a href="${BASE_PATH}company/contact.html" class="btn btn-primary btn-lg mx-8">Talk to Team</a>
                <a href="${BASE_PATH}apps/desktop.html" class="btn btn-outline-gray btn-lg mx-8">Back to Home</a>
            </div>
        </div>
    </div>
</section>`;

  const indexFooter = replaceTokens(footerTemplate, { BASE_PATH });
  await writeFile(path.join(SERVICES_DIR, "index.html"), `${indexHeader}\n${indexBody}\n${indexFooter}`, "utf8");

  process.stdout.write(`Generated ${expectedServices.length} service pages + dist/services/index.html\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
