module.exports = [
  {
    label: "Home",
    href: "/",
    group: "primary",
    children: []
  },
  {
    label: "Services",
    href: "/services/",
    group: "primary",
    children: [
      { label: "Fleet Management", href: "/services/fleet-management/", group: "services" },
      { label: "Dispatch Management", href: "/services/dispatch-management/", group: "services" },
      { label: "Smart Routing", href: "/services/smart-routing/", group: "services" },
      { label: "ELD Devices", href: "/services/eld-devices/", group: "services" },
      { label: "AI DashCams", href: "/services/ai-dashcams/", group: "services" },
      { label: "Fleet Analytics", href: "/services/fleet-analytics/", group: "services" }
    ]
  },
  {
    label: "Company",
    href: "/company/about/",
    group: "primary",
    children: [
      { label: "About", href: "/company/about/", group: "company" },
      { label: "Contact", href: "/contact/", group: "company" },
      { label: "FAQ", href: "/company/faq/", group: "company" },
      { label: "Career", href: "/company/career/", group: "company" }
    ]
  }
];
