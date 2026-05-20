/**
 * SchemaCore.js
 * ---------------------------------------------------------------------------
 * Integr8tiv reusable Schema.org JSON-LD emitter for iMIS RiSE sites.
 *
 * This file holds all shared logic. Per-client wrappers (SchemaSHEED.js,
 * SchemaAISA.js, ...) build a config object and call:
 *     window.I8VSchemaMarkup.init(config)
 *
 * Load order in iMIS Manage Websites -> Advanced Options (HEAD):
 *     <script src=".../Core/SchemaCore.js"></script>
 *     <script src=".../<client>/Schema<CLIENT>.js"></script>
 *
 * Debug:
 *     Append ?schemaDebug=1 to any page URL to log what was emitted.
 *
 * Version: 1.0.0-draft  (2026-05-19)
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // ---- internal state ----------------------------------------------------
  var SCRIPT_ID = 'i8v-schema-jsonld';
  var DEBUG_FLAG = 'schemaDebug';

  function isDebug() {
    try {
      return new URLSearchParams(global.location.search).get(DEBUG_FLAG) === '1';
    } catch (e) {
      return false;
    }
  }

  function log() {
    if (!isDebug()) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[I8VSchemaMarkup]');
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
  }

  // ---- helpers -----------------------------------------------------------

  /**
   * Strip undefined / null / empty-string / empty-array / empty-object values
   * recursively so the emitted JSON-LD only contains real data.
   */
  function clean(value) {
    if (Array.isArray(value)) {
      var arr = value.map(clean).filter(function (v) {
        return v !== undefined;
      });
      return arr.length ? arr : undefined;
    }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (k) {
        var v = clean(value[k]);
        if (v !== undefined) out[k] = v;
      });
      return Object.keys(out).length ? out : undefined;
    }
    if (value === null || value === undefined || value === '') return undefined;
    return value;
  }

  function canonicalUrl() {
    var link = document.querySelector('link[rel="canonical"]');
    if (link && link.href) return link.href;
    return global.location.origin + global.location.pathname;
  }

  function pageDescription() {
    var meta =
      document.querySelector('meta[name="description"]') ||
      document.querySelector('meta[property="og:description"]');
    return meta && meta.content ? meta.content : undefined;
  }

  function pageTitle() {
    return document.title || undefined;
  }

  // ---- page-type detection ----------------------------------------------

  /**
   * Returns one of: 'home', 'about', 'contact', 'other'.
   * Priority: data-schema-page-type attribute on <body> > URL patterns in config.
   */
  function detectPageType(config) {
    var explicit =
      document.body && document.body.getAttribute('data-schema-page-type');
    if (explicit) return explicit.toLowerCase();

    var path = (global.location.pathname || '/').toLowerCase();
    var origin = global.location.origin;
    var orgUrl = (config.organization && config.organization.url) || '';

    // Home: root path, or canonical URL equals organisation URL.
    if (path === '/' || path === '') return 'home';
    if (orgUrl && (origin + path === orgUrl || origin + path + '/' === orgUrl)) {
      return 'home';
    }

    var patterns = (config.pageTypes && config.pageTypes) || {};
    if (matchesAny(path, patterns.about)) return 'about';
    if (matchesAny(path, patterns.contact)) return 'contact';
    return 'other';
  }

  function matchesAny(path, patternList) {
    if (!patternList || !patternList.length) return false;
    for (var i = 0; i < patternList.length; i++) {
      var p = (patternList[i] || '').toLowerCase().trim();
      if (!p) continue;
      // Treat each pattern as a prefix; match with or without a trailing slash.
      if (path === p || path.indexOf(p + '/') === 0 || path.indexOf(p) === 0) {
        return true;
      }
    }
    return false;
  }

  // ---- breadcrumb DOM scrape --------------------------------------------

  /**
   * Best-effort breadcrumb extraction. Looks for a few common selectors used
   * by iMIS RiSE master pages. Returns null if nothing usable was found, so
   * the caller can omit BreadcrumbList rather than emit a broken one.
   */
  function scrapeBreadcrumb(config) {
    var selectors = (config.breadcrumb && config.breadcrumb.selectors) || [
      'nav.breadcrumb a',
      'nav[aria-label="breadcrumb"] a',
      'ol.breadcrumb a',
      '.breadcrumbs a',
      '.iMISBreadcrumb a',
      '[data-breadcrumb] a'
    ];

    for (var i = 0; i < selectors.length; i++) {
      var anchors = document.querySelectorAll(selectors[i]);
      if (anchors && anchors.length) {
        var items = [];
        for (var j = 0; j < anchors.length; j++) {
          var a = anchors[j];
          var text = (a.textContent || '').trim();
          var href = a.href;
          if (text && href) {
            items.push({
              '@type': 'ListItem',
              position: items.length + 1,
              name: text,
              item: href
            });
          }
        }
        if (items.length >= 2) {
          // Append the current page as the final, item-less crumb if not present.
          var last = items[items.length - 1];
          if (last.item !== canonicalUrl() && pageTitle()) {
            items.push({
              '@type': 'ListItem',
              position: items.length + 1,
              name: pageTitle()
            });
          }
          return items;
        }
      }
    }
    return null;
  }

  // ---- @graph node builders ---------------------------------------------

  function buildOrganization(config) {
    var o = config.organization || {};
    var orgId = (o.url || '') + '#organization';

    var address = o.address
      ? Object.assign({ '@type': 'PostalAddress' }, o.address)
      : undefined;

    var geo = o.geo
      ? {
          '@type': 'GeoCoordinates',
          latitude: o.geo.latitude,
          longitude: o.geo.longitude
        }
      : undefined;

    // Parent / faculty / department modelling.
    // If a `department` parent is configured, we express:
    //    SHEEd  --department-->  Faculty  --subOrganization-->  University
    // Otherwise we just link parentOrganization directly to the top-level
    // parent (the simple case used by most clients).
    var parentNode;
    if (o.parent) {
      parentNode = Object.assign(
        { '@type': o.parent.type || 'Organization' },
        {
          name: o.parent.name,
          url: o.parent.url
        }
      );
      if (o.parent.faculty) {
        var facultyId = (o.parent.url || '') + '#faculty';
        var facultyNode = {
          '@type': 'Organization',
          '@id': facultyId,
          name: o.parent.faculty.name,
          parentOrganization: parentNode
        };
        // SHEEd's direct parent becomes the faculty; the faculty's parent is the uni.
        parentNode = facultyNode;
      }
    }

    return clean({
      '@type': o.type || 'Organization',
      '@id': orgId,
      name: o.name,
      alternateName: o.alternateName,
      url: o.url,
      logo: o.logo
        ? { '@type': 'ImageObject', url: o.logo }
        : undefined,
      description: o.description,
      email: o.email,
      telephone: o.telephone,
      address: address,
      geo: geo,
      sameAs: o.sameAs && o.sameAs.length ? o.sameAs : undefined,
      contactPoint:
        o.contactPoints && o.contactPoints.length
          ? o.contactPoints.map(function (cp) {
              return Object.assign({ '@type': 'ContactPoint' }, cp);
            })
          : undefined,
      parentOrganization: parentNode
    });
  }

  function buildWebSite(config) {
    var w = config.website || {};
    var siteId = (config.organization.url || '') + '#website';
    var orgId = (config.organization.url || '') + '#organization';

    var potentialAction;
    if (w.searchUrlTemplate) {
      potentialAction = {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: w.searchUrlTemplate
        },
        'query-input': 'required name=search_term_string'
      };
    }

    return clean({
      '@type': 'WebSite',
      '@id': siteId,
      url: config.organization.url,
      name: w.name || config.organization.name,
      publisher: { '@id': orgId },
      inLanguage: w.inLanguage || 'en-AU',
      potentialAction: potentialAction
    });
  }

  function buildWebPage(config, pageType) {
    var siteId = (config.organization.url || '') + '#website';
    var orgId = (config.organization.url || '') + '#organization';
    var pageId = canonicalUrl() + '#webpage';

    var type;
    if (pageType === 'about') type = 'AboutPage';
    else if (pageType === 'contact') type = 'ContactPage';
    else type = 'WebPage';

    var node = {
      '@type': type,
      '@id': pageId,
      url: canonicalUrl(),
      name: pageTitle(),
      description: pageDescription(),
      isPartOf: { '@id': siteId },
      about: { '@id': orgId },
      inLanguage: (config.website && config.website.inLanguage) || 'en-AU'
    };

    if (pageType === 'about' || pageType === 'contact') {
      node.mainEntity = { '@id': orgId };
    }

    return clean(node);
  }

  function buildBreadcrumb(items) {
    if (!items) return null;
    return clean({
      '@type': 'BreadcrumbList',
      '@id': canonicalUrl() + '#breadcrumb',
      itemListElement: items
    });
  }

  // ---- emit --------------------------------------------------------------

  function emit(graph) {
    // Remove any existing block we injected previously (idempotency on SPAs).
    var existing = document.getElementById(SCRIPT_ID);
    if (existing) existing.parentNode.removeChild(existing);

    var script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = SCRIPT_ID;
    script.text = JSON.stringify(
      { '@context': 'https://schema.org', '@graph': graph },
      null,
      isDebug() ? 2 : 0
    );

    // Prefer <head>; fall back to <body> if head isn't ready yet.
    (document.head || document.body || document.documentElement).appendChild(
      script
    );

    log('emitted @graph with', graph.length, 'nodes', graph);
  }

  // ---- public init -------------------------------------------------------

  function init(config) {
    if (!config || !config.organization || !config.organization.url) {
      log('init aborted: config.organization.url is required');
      return;
    }

    function run() {
      try {
        var pageType = detectPageType(config);
        log('page type:', pageType, 'path:', global.location.pathname);

        var graph = [
          buildOrganization(config),
          buildWebSite(config),
          buildWebPage(config, pageType)
        ];

        var crumbItems = scrapeBreadcrumb(config);
        var crumb = buildBreadcrumb(crumbItems);
        if (crumb) graph.push(crumb);
        else log('breadcrumb skipped (no usable trail found)');

        emit(graph.filter(Boolean));
      } catch (err) {
        // eslint-disable-next-line no-console
        if (isDebug()) console.error('[I8VSchemaMarkup] error:', err);
      }
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  // expose
  global.I8VSchemaMarkup = {
    init: init,
    // exposed for tests / future content-type emitters
    _internal: {
      buildOrganization: buildOrganization,
      buildWebSite: buildWebSite,
      buildWebPage: buildWebPage,
      buildBreadcrumb: buildBreadcrumb,
      detectPageType: detectPageType,
      scrapeBreadcrumb: scrapeBreadcrumb,
      clean: clean
    }
  };
})(window);
