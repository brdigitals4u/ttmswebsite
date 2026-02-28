import "./main.css";

const DEFERRED_SRC_ATTRS = ["data-src", "data-ttms-src"];
const DEFERRED_SRCSET_ATTRS = ["data-srcset", "data-ttms-srcset"];
const DEFERRED_SIZES_ATTRS = ["data-sizes", "data-ttms-sizes"];
const DEFERRED_SCRIPT_SRC_ATTRS = ["data-ttms-src", "data-src"];

function readDeferredAttr(element, attrNames) {
  for (const attrName of attrNames) {
    const value = element.getAttribute(attrName);
    if (value) {
      return value;
    }
  }

  return "";
}

function clearDeferredAttrs(element, attrNames) {
  attrNames.forEach((attrName) => element.removeAttribute(attrName));
}

function hasAnyDeferredAttr(element) {
  const attrNames = [...DEFERRED_SRC_ATTRS, ...DEFERRED_SRCSET_ATTRS, ...DEFERRED_SIZES_ATTRS];
  return attrNames.some((attrName) => element.hasAttribute(attrName));
}

function markLazyImageLoaded(imageEl) {
  imageEl.classList.add("ttms-loaded");
  imageEl.setAttribute("data-ttms-loaded", "true");
}

function watchLazyImageLoad(imageEl) {
  if (!imageEl || imageEl.getAttribute("data-ttms-loaded") === "true") {
    return;
  }

  if (imageEl.complete && imageEl.naturalWidth > 0) {
    markLazyImageLoaded(imageEl);
    return;
  }

  imageEl.addEventListener(
    "load",
    () => {
      markLazyImageLoaded(imageEl);
    },
    { once: true }
  );
}

function activateLazyPictureSources(imageEl) {
  const pictureEl = imageEl.closest("picture");
  if (!pictureEl) {
    return;
  }

  const sourceEls = Array.from(pictureEl.querySelectorAll("source"));
  sourceEls.forEach((sourceEl) => {
    const deferredSrcset = readDeferredAttr(sourceEl, DEFERRED_SRCSET_ATTRS);
    if (deferredSrcset) {
      sourceEl.setAttribute("srcset", deferredSrcset);
      clearDeferredAttrs(sourceEl, DEFERRED_SRCSET_ATTRS);
    }

    const deferredSizes = readDeferredAttr(sourceEl, DEFERRED_SIZES_ATTRS);
    if (deferredSizes) {
      sourceEl.setAttribute("sizes", deferredSizes);
      clearDeferredAttrs(sourceEl, DEFERRED_SIZES_ATTRS);
    }
  });
}

function hasDeferredImageData(imageEl) {
  if (hasAnyDeferredAttr(imageEl)) {
    return true;
  }

  const pictureEl = imageEl.closest("picture");
  if (!pictureEl) {
    return false;
  }

  return Array.from(pictureEl.querySelectorAll("source")).some((sourceEl) => hasAnyDeferredAttr(sourceEl));
}

function activateLazyImage(imageEl) {
  if (!imageEl) {
    return;
  }

  activateLazyPictureSources(imageEl);

  const deferredSrc = readDeferredAttr(imageEl, DEFERRED_SRC_ATTRS);
  const deferredSrcset = readDeferredAttr(imageEl, DEFERRED_SRCSET_ATTRS);
  const deferredSizes = readDeferredAttr(imageEl, DEFERRED_SIZES_ATTRS);

  if (deferredSrcset) {
    imageEl.setAttribute("srcset", deferredSrcset);
    clearDeferredAttrs(imageEl, DEFERRED_SRCSET_ATTRS);
  }

  if (deferredSizes) {
    imageEl.setAttribute("sizes", deferredSizes);
    clearDeferredAttrs(imageEl, DEFERRED_SIZES_ATTRS);
  }

  if (deferredSrc) {
    imageEl.setAttribute("src", deferredSrc);
    clearDeferredAttrs(imageEl, DEFERRED_SRC_ATTRS);
  }

  watchLazyImageLoad(imageEl);
}

function initLazyImages() {
  const lazyImages = Array.from(new Set(Array.from(document.querySelectorAll("img.ttms-lazy-image, img.lazy"))));
  if (!lazyImages.length) {
    return;
  }

  const immediateImages = lazyImages.filter((imageEl) => !hasDeferredImageData(imageEl));
  immediateImages.forEach((imageEl) => watchLazyImageLoad(imageEl));

  const deferredImages = lazyImages.filter((imageEl) => hasDeferredImageData(imageEl));
  if (!deferredImages.length) {
    return;
  }

  if (!("IntersectionObserver" in window)) {
    deferredImages.forEach((imageEl) => activateLazyImage(imageEl));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const imageEl = entry.target;
        activateLazyImage(imageEl);
        observer.unobserve(imageEl);
      });
    },
    { rootMargin: "300px 0px" }
  );

  deferredImages.forEach((imageEl) => observer.observe(imageEl));
}

function initDeferredSections() {
  const deferredSections = Array.from(document.querySelectorAll(".ttms-defer-section"));
  if (!deferredSections.length) {
    return;
  }

  deferredSections.forEach((sectionEl) => sectionEl.classList.add("ttms-section-managed"));

  if (!("IntersectionObserver" in window)) {
    deferredSections.forEach((sectionEl) => sectionEl.classList.add("ttms-section-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const sectionEl = entry.target;
        sectionEl.classList.add("ttms-section-visible");
        observer.unobserve(sectionEl);
      });
    },
    { rootMargin: "350px 0px" }
  );

  deferredSections.forEach((sectionEl) => observer.observe(sectionEl));
}

function cloneScriptAttributes(sourceScriptEl, targetScriptEl) {
  Array.from(sourceScriptEl.attributes).forEach((attribute) => {
    const attrName = attribute.name;
    if (
      attrName === "src" ||
      attrName === "data-src" ||
      attrName === "data-ttms-src" ||
      attrName === "data-ttms-lazy-script"
    ) {
      return;
    }
    targetScriptEl.setAttribute(attrName, attribute.value);
  });
}

async function loadLazyLegacyScripts(scriptPlaceholders) {
  for (const placeholderScriptEl of scriptPlaceholders) {
    const scriptSrc = readDeferredAttr(placeholderScriptEl, DEFERRED_SCRIPT_SRC_ATTRS);
    if (!scriptSrc) {
      continue;
    }

    await new Promise((resolve) => {
      const scriptEl = document.createElement("script");
      cloneScriptAttributes(placeholderScriptEl, scriptEl);
      scriptEl.src = scriptSrc;
      scriptEl.defer = true;

      scriptEl.addEventListener("load", resolve, { once: true });
      scriptEl.addEventListener("error", resolve, { once: true });

      const parentEl = placeholderScriptEl.parentNode || document.body || document.documentElement;
      if (parentEl && placeholderScriptEl.parentNode) {
        parentEl.insertBefore(scriptEl, placeholderScriptEl.nextSibling);
      } else {
        parentEl.appendChild(scriptEl);
      }
    });

    placeholderScriptEl.remove();
  }
}

function initLazyLegacyScripts() {
  const scriptPlaceholders = Array.from(
    document.querySelectorAll('script[data-ttms-lazy-script="true"]')
  );
  if (!scriptPlaceholders.length) {
    return;
  }

  let hasStartedLoading = false;
  const startLoading = () => {
    if (hasStartedLoading) {
      return;
    }
    hasStartedLoading = true;
    void loadLazyLegacyScripts(scriptPlaceholders);
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(startLoading, { timeout: 2200 });
  } else {
    window.setTimeout(startLoading, 1200);
  }

  window.addEventListener("pointerdown", startLoading, { once: true });
  window.addEventListener("keydown", startLoading, { once: true });
  window.addEventListener("touchstart", startLoading, { once: true, passive: true });
  window.addEventListener("scroll", startLoading, { once: true, passive: true });
  window.addEventListener("load", startLoading, { once: true });
}

function bootstrapPerformanceHydration() {
  initLazyImages();
  initDeferredSections();
  initLazyLegacyScripts();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapPerformanceHydration, { once: true });
} else {
  bootstrapPerformanceHydration();
}

window.TTMS_BUILD = {
  generatedBy: "11ty-vite",
  buildTime: new Date().toISOString(),
  lazyImagesEnabled: true,
  sectionDeferralEnabled: true
};
