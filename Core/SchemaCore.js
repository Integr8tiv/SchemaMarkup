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
      var raw = (patternList[i] || '').trim();
      if (!raw) continue;
      var p = raw.toLowerCase();

      // RegExp pattern: /.../ - caller can pass a regex literal as a string
      // (e.g. '/^/web/content/about-us//') for full control.
      if (raw.length > 2 && raw[0] === '/' && raw.lastIndexOf('/') > 0) {
        var lastSlash = raw.lastIndexOf('/');
        if (lastSlash > 0 && lastSlash < raw.length - 1) {
          // looks like a flagged regex literal: /pattern/flags
          try {
            var body = raw.slice(1, lastSlash);
            var flags = raw.slice(lastSlash + 1);
            if (new RegExp(body, flags).test(path)) return true;
            continue;
          } catch (e) { /* fall through to substring match */ }
        }
      }

      // Default behaviour: substring match anywhere in the path.
      // Catches both clean URLs (/about-us) and iMIS RiSE .aspx URLs
      // (/web/content/about-us/about-us.aspx) with the same pattern.
      if (path.indexOf(p) !== -1) return true;
    }
    return false;
  }

  // ---- breadcrumb DOM scrape --------------------------------------------

  /**
   * Best-effort breadcrumb extraction.
   *
   * Walks <li> (or fallback <a>) elements inside a breadcrumb container,
   * picking up the text and link for each. The final item is typically the
   * current page, marked aria-current="page" with no anchor - we accept that
   * and emit a final ListItem without an `item` (Schema.org allows this).
   *
   * Returns null if nothing usable was found, so the caller can omit
   * BreadcrumbList rather than emit a broken one.
   */
  function scrapeBreadcrumb(config) {
    // Container selectors - we look at the container, then walk its <li>s.
    var containerSelectors =
      (config.breadcrumb && config.breadcrumb.containerSelectors) || [
        // iMIS RiSE default
        '#asi_BreadCrumb',
        'nav#asi_BreadCrumbNav ol',
        // Generic Bootstrap-y patterns
        'ol.breadcrumb',
        'nav.breadcrumb',
        'nav[aria-label="breadcrumb"]',
        '.breadcrumbs',
        '.iMISBreadcrumb',
        '[data-breadcrumb]'
      ];

    for (var i = 0; i < containerSelectors.length; i++) {
      var container = document.querySelector(containerSelectors[i]);
      if (!container) continue;

      var lis = container.querySelectorAll('li');
      var rows = lis && lis.length ? lis : container.children;
      if (!rows || !rows.length) continue;

      var items = [];
      for (var j = 0; j < rows.length; j++) {
        var row = rows[j];
        var anchor = row.querySelector ? row.querySelector('a[href]') : null;
        var text = (anchor ? anchor.textContent : row.textContent || '').trim();
        if (!text) continue;
        var entry = {
          '@type': 'ListItem',
          position: items.length + 1,
          name: text
        };
        if (anchor && anchor.href) entry.item = anchor.href;
        items.push(entry);
      }

      if (items.length >= 1) {
        // If the last item has an `item`, append the current page so the
        // trail ends on the page the user is on.
        var last = items[items.length - 1];
        if (last.item && last.item !== canonicalUrl() && pageTitle()) {
          items.push({
            '@type': 'ListItem',
            position: items.length + 1,
            name: pageTitle()
          });
        }
        return items;
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

    function build() {
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
      else log('breadcrumb skipped (no usable trail found yet)');

      emit(graph.filter(Boolean));
      return !!crumb; // true if a breadcrumb was included this time
    }

    function run() {
      try {
        var hadCrumb = build();

        // iMIS RiSE often renders the breadcrumb after DOMContentLoaded
        // (deferred populate via a follow-up script). If we didn't see one
        // on the first pass, watch the breadcrumb container until it has
        // children, then re-emit. Give up after a few seconds so we don't
        // observe forever.
        if (!hadCrumb && typeof MutationObserver === 'function') {
          var container =
            document.getElementById('masterMainBreadcrumb') ||
            document.querySelector('nav#asi_BreadCrumbNav') ||
            document.querySelector('#asi_BreadCrumb');
          if (!container) return;

          var obs = new MutationObserver(function () {
            var items = scrapeBreadcrumb(config);
            if (items && items.length) {
              log('breadcrumb appeared after initial render, re-emitting');
              obs.disconnect();
              build();
            }
          });
          obs.observe(container, { childList: true, subtree: true });

          // Safety cap: stop watching after 8 seconds.
          setTimeout(function () { obs.disconnect(); }, 8000);
        }
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
