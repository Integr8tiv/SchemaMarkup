/**
 * SchemaSHEED.js
 * ---------------------------------------------------------------------------
 * Per-client config + bootstrap for Sydney Health Executive Education (SHEEd).
 *
 * Loaded *after* SchemaCore.js. The core registers window.I8VSchemaMarkup.
 *
 * Wire-up in iMIS RiSE Manage Websites -> Advanced Options (HEAD):
 *   <script src=".../SchemaMarkup@main/Core/SchemaCore.js"></script>
 *   <script src=".../SchemaMarkup@main/SHEEd/SchemaSHEED.js"></script>
 *
 * Values sourced from client-data-SHEEd.md.
 * Update this file and push to GitHub; jsDelivr will pick up the change.
 *
 * Version: 1.0.0-draft  (2026-05-19)
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (!window.I8VSchemaMarkup || typeof window.I8VSchemaMarkup.init !== 'function') {
    // eslint-disable-next-line no-console
    console.warn(
      '[SchemaSHEED] SchemaCore.js did not load before SchemaSHEED.js. ' +
        'Check the Manage Websites HEAD includes both scripts in the right order.'
    );
    return;
  }

  var SHEED_CONFIG = {
    organization: {
      type: 'EducationalOrganization',
      name: 'Sydney Health Executive Education',
      alternateName: 'SHEEd',
      url: 'https://health-exec-ed.sydney.edu.au/',
      logo: 'https://health-exec-ed.sydney.edu.au/images/SHEEd/SHEE-website-logo.svg',
      description:
        'Sydney Health Executive Education offers health sector professionals the chance to advance their careers through innovative education. We provide industry-leading short courses, microcredentials, workshops, and tailored workforce development solutions.',
      email: 'fmh.sheed@sydney.edu.au',
      // telephone intentionally omitted - SHEEd does not publish a phone number.
      address: {
        streetAddress: 'Susan Wakil Health Building, Western Avenue',
        addressLocality: 'Camperdown',
        addressRegion: 'NSW',
        postalCode: '2006',
        addressCountry: 'AU'
      },
      geo: {
        latitude: -33.886,
        longitude: 151.1857
      },
      // sameAs intentionally omitted - SHEEd has no unit-level social presence.
      // contactPoints intentionally omitted for v1 - email on the org is sufficient.
      parent: {
        type: 'CollegeOrUniversity',
        name: 'The University of Sydney',
        url: 'https://www.sydney.edu.au/',
        faculty: {
          name: 'Faculty of Medicine and Health'
        }
      }
    },
    website: {
      name: 'Sydney Health Executive Education',
      inLanguage: 'en-AU',
      // Once the legacy /search?search=... is retired, this template is correct.
      // If launching before that cutover, change "q" to "search".
      searchUrlTemplate:
        'https://health-exec-ed.sydney.edu.au/search?q={search_term_string}'
    },
    pageTypes: {
      about: ['/about', '/about-us'],
      contact: ['/contact', '/contact-us']
    }
    // breadcrumb.selectors omitted - falls back to the default list in SchemaCore.
  };

  window.I8VSchemaMarkup.init(SHEED_CONFIG);
})();
