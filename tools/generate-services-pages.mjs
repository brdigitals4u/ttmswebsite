#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

const TEMPLATES_DIR = path.join(ROOT, "dist", "_templates");
const SERVICES_DIR = path.join(ROOT, "dist", "services");
const BASE_PATH = "../";
const LOCAL_LIBRARY_ROOT = path.join(ROOT, "dist", "assets", "images", "services-library");
const LOCAL_LIBRARY_BASE_URL = `${BASE_PATH}assets/images/services-library`;

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
const LOCAL_GROUPS = ["truck", "trailer", "eld", "dashcam", "gps", "dashboard", "driver"];
const PINNED_IMAGES = {
  driverSafety: `${BASE_PATH}assets/images/ttms/driver-safety-alert.png`,
  integrationEld: `${BASE_PATH}assets/images/ttms/integration-eld-platform.png`,
  aiDashcam: `${BASE_PATH}assets/images/ttms/ai-dashcam-device.png`,
  eldDevice: `${BASE_PATH}assets/images/ttms/eld-hardware-device.png`
};
const FLEET_IMAGES = [
  `${BASE_PATH}assets/images/ttms/fleet-trucks-lineup.png`,
  `${BASE_PATH}assets/images/ttms/fleet-truck-red-driver.png`,
  `${BASE_PATH}assets/images/ttms/fleet-trucks-highway.png`
];
const FALLBACK_LIBRARY = {
  truck: FLEET_IMAGES,
  trailer: FLEET_IMAGES,
  eld: [PINNED_IMAGES.eldDevice],
  dashcam: [PINNED_IMAGES.aiDashcam],
  gps: [`${BASE_PATH}assets/images/ttms/services-anti-theft.jpg`],
  dashboard: [`${BASE_PATH}assets/images/ttms/services-hardware-overview.jpg`],
  driver: [PINNED_IMAGES.driverSafety]
};
let IMAGE_LIBRARY = { ...FALLBACK_LIBRARY };

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

function normalizeHintText(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(/[=&/?_.,+-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function pickImageGroup(seed) {
  const text = normalizeHintText(seed);
  if (/(trailer|load planning|yard|freight)/.test(text)) return "trailer";
  if (/(eld|hos|ifta|dvir|logbook)/.test(text)) return "eld";
  if (/(dashcam|camera|vision|incident|collision)/.test(text)) return "dashcam";
  if (/(gps|anti theft|antitheft|theft|asset tracking|geo|geofence)/.test(text)) return "gps";
  if (/(audit|analytics|report|metrics|dashboard|kpi|api|integration|telematics|oem|compliance)/.test(text)) return "dashboard";
  if (/(driver|monitoring|fatigue|drowsy|coaching|rest|food|wellbeing)/.test(text)) return "driver";
  if (/(safety alert|safety solution|safety)/.test(text)) return "dashcam";
  return "truck";
}

function groupCandidates(group) {
  const preferred = IMAGE_LIBRARY[group];
  if (Array.isArray(preferred) && preferred.length) {
    return preferred;
  }
  return FALLBACK_LIBRARY[group] || FALLBACK_LIBRARY.truck;
}

function dedupeUrls(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

function pickFromCandidates(seed, candidates, usedImages) {
  if (!candidates.length) {
    return FLEET_IMAGES[0];
  }

  for (const imageUrl of candidates) {
    if (!usedImages || !usedImages.has(imageUrl)) {
      if (usedImages) usedImages.add(imageUrl);
      return imageUrl;
    }
  }

  const fallback = candidates[hashString(seed) % candidates.length];
  if (usedImages) usedImages.add(fallback);
  return fallback;
}

function buildPreferredCandidates(seed, group) {
  const text = normalizeHintText(seed);
  const preferredGroup = group || pickImageGroup(seed);

  if (/(audit|edit)/.test(text)) {
    return dedupeUrls([
      ...groupCandidates("dashboard")
    ]);
  }

  if (/(care|driver care|user safety)/.test(text)) {
    return dedupeUrls([
      PINNED_IMAGES.driverSafety,
      ...groupCandidates("driver"),
      ...groupCandidates("dashcam")
    ]);
  }

  if (/(integration|integrations)/.test(text) && /(eld|hos|ifta|dvir|logbook)/.test(text)) {
    return dedupeUrls([
      PINNED_IMAGES.integrationEld,
      ...groupCandidates("eld"),
      ...groupCandidates("dashboard")
    ]);
  }

  if (/(eld|hos|ifta|dvir|logbook)/.test(text)) {
    return dedupeUrls([
      PINNED_IMAGES.eldDevice,
      PINNED_IMAGES.integrationEld,
      ...groupCandidates("eld"),
      ...groupCandidates("dashboard")
    ]);
  }

  if (/(dashcam|ai dashcam|camera ai|camera|vision|incident|collision)/.test(text)) {
    return dedupeUrls([
      PINNED_IMAGES.aiDashcam,
      ...groupCandidates("dashcam"),
      ...groupCandidates("driver")
    ]);
  }

  if (/(safety|driver safety|driver monitoring|monitoring|fatigue|drowsy|coaching|wellbeing|rest food)/.test(text)) {
    return dedupeUrls([
      PINNED_IMAGES.driverSafety,
      ...groupCandidates("driver"),
      ...groupCandidates("dashcam")
    ]);
  }

  if (
    preferredGroup === "truck" ||
    preferredGroup === "trailer" ||
    /(fleet|truck|trailer|dispatch|routing|route|load planning|carrier|freight)/.test(text)
  ) {
    return dedupeUrls([
      ...FLEET_IMAGES,
      ...groupCandidates(preferredGroup),
      ...groupCandidates("truck"),
      ...groupCandidates("trailer")
    ]);
  }

  const fallbackOrder = [
    preferredGroup,
    "truck",
    "trailer",
    "eld",
    "dashcam",
    "gps",
    "dashboard",
    "driver"
  ].filter((item, index, arr) => arr.indexOf(item) === index);
  return dedupeUrls(fallbackOrder.flatMap((candidateGroup) => groupCandidates(candidateGroup)));
}

function pickLocalImage(seed, group, usedImages) {
  const candidates = buildPreferredCandidates(seed, group);
  return pickFromCandidates(seed, candidates, usedImages);
}

function buildThemeImage(seed, _size = "1200x800", options = {}) {
  return pickLocalImage(seed, options.group, options.usedImages);
}

function resolveThemeImage(url, seed, size = "1200x800", options = {}) {
  if (!url) {
    return buildThemeImage(seed, size, options);
  }

  if (url.includes("source.unsplash.com")) {
    const hint = normalizeHintText(url.split("?")[1] || "");
    return buildThemeImage(`${seed} ${hint}`, size, options);
  }

  if (url.includes("images.unsplash.com")) {
    return buildThemeImage(seed, size, options);
  }

  return url;
}

async function loadLocalImageLibrary() {
  const libraryEntries = await Promise.all(
    LOCAL_GROUPS.map(async (group) => {
      const folder = path.join(LOCAL_LIBRARY_ROOT, group);
      try {
        const files = (await readdir(folder))
          .filter((file) => /\.(jpg|jpeg|png|webp)$/i.test(file))
          .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
        const urls = files.map((file) => `${LOCAL_LIBRARY_BASE_URL}/${group}/${file}`);
        return [group, urls.length ? urls : FALLBACK_LIBRARY[group] || FALLBACK_LIBRARY.truck];
      } catch {
        return [group, FALLBACK_LIBRARY[group] || FALLBACK_LIBRARY.truck];
      }
    })
  );

  IMAGE_LIBRARY = Object.fromEntries(libraryEntries);
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

function secondaryGroupFor(primaryGroup) {
  switch (primaryGroup) {
    case "trailer":
      return "truck";
    case "truck":
      return "trailer";
    case "eld":
      return "truck";
    case "dashcam":
      return "driver";
    case "gps":
      return "truck";
    case "dashboard":
      return "truck";
    case "driver":
      return "dashcam";
    default:
      return "truck";
  }
}

function careGroupFor(record) {
  const text = normalizeHintText(`${record.slug} ${record.title} ${record.hero_heading || ""}`);
  if (/(driver|monitoring|dashcam|camera|safety|wellbeing|care|rest food)/.test(text)) return "driver";
  return "driver";
}

function createImageContext(record) {
  const usedImages = new Set();
  return {
    pick(seed, group, size = "1200x800") {
      return buildThemeImage(`${record.slug} ${seed}`, size, { group, usedImages });
    },
    resolve(url, seed, size = "1200x800", group) {
      return resolveThemeImage(url, `${record.slug} ${seed}`, size, { group, usedImages });
    }
  };
}

function buildOpsHeading(record) {
  return `How TTMS powers ${record.title}`;
}

function ensureSentence(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function buildOpsOverview(record) {
  const lead = record.core_capabilities?.[0] || `${record.title} execution`;
  return `${ensureSentence(record.hero_copy)} This service emphasizes ${lead.toLowerCase()}.`;
}

function buildCareHeading(record) {
  if (record.category === "Driver Services") return "Driver Safety & Care";
  if (record.category === "Alerts & Notifications") return "Proactive Safety Response";
  return "User Safety & Care";
}

function buildCareOverview(record) {
  const first = record.safety_care_points?.[0] || "";
  const second = record.safety_care_points?.[1] || "";
  return [ensureSentence(first), ensureSentence(second)].filter(Boolean).join(" ");
}

function buildHardwareHeading(record) {
  return `${record.title}: Hardware, Dashcam & Anti-Theft`;
}

function buildExecutionHeading(record) {
  return `${record.title} Execution Framework`;
}

function buildAuditHeading(record) {
  return `${record.title} Audit & Compliance Reporting`;
}

function buildAuditOverview(record) {
  const focus = record.execution_points?.[0] || "prepare regulator-facing and owner-facing reviews";
  return `${record.title} data feeds TTMS reporting automatically so teams can ${focus.replace(/\.$/, "").toLowerCase()} and maintain audit-ready records.`;
}

function buildDefaultHardware(record, imageContext) {
  return [
    {
      category: "ELD DEVICES",
      title: `${record.title} ELD Compliance`,
      copy: `Keep ${record.title.toLowerCase()} compliant with real-time ELD logs, HOS visibility, and inspection-ready records.`,
      image_url: imageContext.pick("hardware eld ifta hos compliance", "eld")
    },
    {
      category: "AI DASHCAM",
      title: `${record.title} AI Safety`,
      copy: `Use AI DashCam events in ${record.title.toLowerCase()} workflows to coach better, reduce risk, and respond faster to incidents.`,
      image_url: imageContext.pick("hardware ai dashcam road safety camera", "dashcam")
    },
    {
      category: "GPS ANTI-THEFT",
      title: `${record.title} GPS Protection`,
      copy: `GPS anti-theft tracking keeps ${record.title.toLowerCase()} assets visible and flags unauthorized movement quickly.`,
      image_url: imageContext.pick("hardware gps anti theft tracker geofence", "gps")
    }
  ];
}

function buildExecutionArticles(record, imageContext, primaryGroup) {
  const executeGroup = primaryGroup === "trailer" ? "trailer" : "truck";
  const improveGroup = /(driver|monitoring|rest-food|safety|dashcam)/.test(record.slug) ? "driver" : "dashboard";
  const stepGroups = ["dashboard", executeGroup, improveGroup];

  return EXECUTION_STEPS.map((step, index) => ({
    category: "SERVICE EXECUTION",
    title: step,
    copy: record.execution_points[index] || record.execution_points[record.execution_points.length - 1],
    image_url: imageContext.pick(`execution ${step} ${record.title}`, stepGroups[index] || primaryGroup)
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

function buildGalleryArticles(record, imageContext, primaryGroup) {
  const fallbackGallery = [
    record.hero_image_url,
    record.operations_image_url,
    null
  ];
  const galleryImages = Array.isArray(record.gallery_image_urls) && record.gallery_image_urls.length
    ? record.gallery_image_urls.slice(0, 3)
    : fallbackGallery;
  const galleryCopy = [
    record.hero_copy,
    record.core_capabilities?.[0] || "Operational clarity with service-specific visibility.",
    record.safety_care_points?.[0] || "Safer execution for drivers, owners, and customers."
  ];

  return galleryImages.map((image, index) => {
    const galleryGroup = index === 0 ? primaryGroup : index === 1 ? secondaryGroupFor(primaryGroup) : careGroupFor(record);
    return {
    category: "SERVICE GALLERY",
    title: `${record.title} Visual ${index + 1}`,
    copy: galleryCopy[index] || galleryCopy[galleryCopy.length - 1],
    image_url: image
      ? imageContext.resolve(image, `gallery ${index + 1}`, "1200x800", galleryGroup)
      : imageContext.pick(`gallery ${index + 1}`, galleryGroup)
    };
  });
}

function buildServiceSections(record, bodyTemplate, imageContext = createImageContext(record)) {
  const kpis = Array.isArray(record.kpi_metrics) && record.kpi_metrics.length
    ? record.kpi_metrics
    : [
        { value: "96%", label: "Operational consistency" },
        { value: "24/7", label: "Live transport visibility" },
        { value: "28%", label: "Faster issue response" }
      ];

  const coreCapabilities = record.core_capabilities.slice(0, 6);
  const safetyPoints = record.safety_care_points.slice(0, 6);
  const primaryGroup = pickImageGroup(`${record.slug} ${record.title} ${record.hero_heading}`);
  const opsImage = imageContext.resolve(record.operations_image_url || record.hero_image_url, "operations", "1200x800", primaryGroup);
  const secondaryImage = imageContext.resolve(record.secondary_image_url, "secondary", "1200x800", secondaryGroupFor(primaryGroup));
  const careImage = imageContext.resolve(record.care_image_url, "care driver camera", "1200x800", careGroupFor(record));
  const auditImage = imageContext.resolve(record.audit_image_url, "audit", "1200x800", "dashboard");
  const auditSecondaryImage = imageContext.resolve(record.audit_secondary_image_url, "audit secondary dashboard", "1200x800", "dashboard");

  const hardwareArticles = Array.isArray(record.hardware_highlights) && record.hardware_highlights.length
    ? record.hardware_highlights.map((item, index) => ({
        ...item,
        image_url: imageContext.resolve(
          item.image_url,
          `hardware custom ${index + 1} ${item.category || ""} ${item.title || ""}`,
          "1200x800",
          pickImageGroup(`${item.category || ""} ${item.title || ""}`)
        )
      }))
    : buildDefaultHardware(record, imageContext);
  const executionArticles = buildExecutionArticles(record, imageContext, primaryGroup);
  const auditPoints = Array.isArray(record.audit_report_points) && record.audit_report_points.length
    ? record.audit_report_points
    : buildDefaultAuditPoints(record);
  const galleryArticles = buildGalleryArticles(record, imageContext, primaryGroup);

  return replaceTokens(bodyTemplate, {
    BASE_PATH,
    SERVICE_TITLE: escapeHtml(record.title),
    OPS_HEADING: escapeHtml(buildOpsHeading(record)),
    OPS_OVERVIEW_COPY: escapeHtml(buildOpsOverview(record)),
    CARE_HEADING: escapeHtml(buildCareHeading(record)),
    CARE_OVERVIEW_COPY: escapeHtml(buildCareOverview(record)),
    HARDWARE_HEADING: escapeHtml(buildHardwareHeading(record)),
    EXECUTION_HEADING: escapeHtml(buildExecutionHeading(record)),
    AUDIT_HEADING: escapeHtml(buildAuditHeading(record)),
    AUDIT_OVERVIEW_COPY: escapeHtml(buildAuditOverview(record)),
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
  const usedImages = new Set();
  return TAXONOMY.map((group) => {
    const cards = group.services
      .map(([slug, title, fallbackSummary]) => {
        const content = contentBySlug.get(slug);
        const summary = content?.hero_copy || fallbackSummary;

        return `
            <div class="col col-lg-4 col-md-6 col-12">
                <div class="card card-article card-article-about wow fadeInUp">
                    <div class="card-article-heading">
                        <img src="${escapeHtml(resolveThemeImage(content?.hero_image_url, `${slug}-catalog`, "1200x800", {
                          usedImages,
                          group: pickImageGroup(`${slug} ${title}`)
                        }))}" alt="${escapeHtml(title)}" loading="lazy">
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
  await loadLocalImageLibrary();

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
    const imageContext = createImageContext(record);
    const heroGroup = pickImageGroup(`${record.slug} ${record.title} ${record.hero_heading}`);

    const header = replaceTokens(headerTemplate, {
      BASE_PATH,
      PAGE_TITLE: `${escapeHtml(record.title)} | TTMS Services | TTMS`,
      BODY_CLASS: "landing-about services-page",
      SERVICE_TITLE: escapeHtml(record.title),
      HERO_TAG: escapeHtml(record.hero_tag || record.category),
      HERO_HEADING: escapeHtml(record.hero_heading),
      HERO_COPY: escapeHtml(record.hero_copy),
      HERO_IMAGE_URL: escapeHtml(imageContext.resolve(record.hero_image_url, "hero", "1600x900", heroGroup))
    });

    const body = buildServiceSections(record, bodyTemplate, imageContext);
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
    HERO_IMAGE_URL: `${BASE_PATH}assets/images/ttms/services-hardware-overview.jpg`
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
